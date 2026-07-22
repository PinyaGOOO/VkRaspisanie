const axios = require("axios")
const FormData = require("form-data")
const fs = require("fs")

const VK_API = "https://api.vk.com/method/"
const API_VER = "5.199"

class VkBot {
    constructor(token, groupId) {
        this.token = token
        this.groupId = groupId
        this._handlers = { message: [], callback: [] }
        this._errorHandler = (e) => console.error("[VkBot Error]", e)
        this._running = false
        // filePath -> { mtimeMs, attach }. Одни и те же картинки расписания
        // запрашивают сотни пользователей — кэш убирает повторную загрузку в VK.
        this._photoCache = new Map()
    }

    on(event, handler) { this._handlers[event].push(handler) }
    catch(handler) { this._errorHandler = handler }

    async api(method, params = {}) {
        const url = VK_API + method
        const body = new URLSearchParams({
            ...params,
            access_token: this.token,
            v: API_VER,
        })
        const res = await axios.post(url, body, { timeout: 15000 })
        if (res.data.error) {
            const err = new Error(`VK API Error ${res.data.error.error_code}: ${res.data.error.error_msg}`)
            err.code = res.data.error.error_code
            throw err
        }
        return res.data.response
    }

    async sendMessage(peerId, text, keyboard = null, keyboardRaw = null) {
        const params = {
            peer_id: peerId,
            message: text || " ",
            random_id: Math.floor(Math.random() * 1e9),
        }
        if (keyboardRaw) {
            params.keyboard = keyboardRaw
        } else if (keyboard) {
            params.keyboard = JSON.stringify(keyboard)
        }
        return await this.api("messages.send", params)
    }

    async deleteMessage(peerId, messageId) {
        try {
            await this.api("messages.delete", {
                peer_id: peerId,
                message_ids: messageId,
                delete_for_all: 1,
            })
        } catch(e) {}
    }

    _fileMtime(filePath) {
        try { return fs.statSync(filePath).mtimeMs } catch (e) { return null }
    }

    // Загружает один файл на уже полученный upload-сервер и сохраняет его.
    async _uploadToServer(filePath, uploadUrl) {
        const form = new FormData()
        form.append("photo", fs.createReadStream(filePath))
        const uploadRes = await axios.post(uploadUrl, form, {
            headers: form.getHeaders(),
            timeout: 30000,
        })
        if (!uploadRes.data || !uploadRes.data.photo) {
            throw new Error(`VK не принял фото, ответ: ${JSON.stringify(uploadRes.data)}`)
        }
        const saved = await this.api("photos.saveMessagesPhoto", {
            photo: uploadRes.data.photo,
            server: uploadRes.data.server,
            hash: uploadRes.data.hash,
        })
        return `photo${saved[0].owner_id}_${saved[0].id}`
    }

    // Возвращает attachment-строки для файлов: из кэша (если файл не менялся)
    // либо параллельно грузит недостающие через один общий upload-сервер.
    async _resolveAttachments(filePaths) {
        const results = new Array(filePaths.length)
        const pending = []
        for (let i = 0; i < filePaths.length; i++) {
            const fp = filePaths[i]
            const mtimeMs = this._fileMtime(fp)
            if (mtimeMs === null) throw new Error(`Файл не найден: ${fp}`)
            const cached = this._photoCache.get(fp)
            if (cached && cached.mtimeMs === mtimeMs) {
                results[i] = cached.attach
            } else {
                pending.push({ i, fp, mtimeMs })
            }
        }
        if (pending.length > 0) {
            let server = await this.api("photos.getMessagesUploadServer", {})
            // Последовательно: параллельная загрузка нескольких фото на один
            // upload-сервер иногда возвращает "photo":"" (VK не успевает обработать).
            // Плюс один ретрай со свежим сервером на случай пустого ответа/сбоя.
            for (const { i, fp, mtimeMs } of pending) {
                let attach = null
                for (let attempt = 0; attempt < 2; attempt++) {
                    try {
                        attach = await this._uploadToServer(fp, server.upload_url)
                        break
                    } catch (e) {
                        if (attempt === 1) throw e
                        await new Promise(r => setTimeout(r, 500))
                        server = await this.api("photos.getMessagesUploadServer", {})
                    }
                }
                this._photoCache.set(fp, { mtimeMs, attach })
                results[i] = attach
            }
        }
        return results
    }

    async uploadPhoto(filePath) {
        const [attach] = await this._resolveAttachments([filePath])
        return attach
    }

    async sendPhotos(peerId, filePaths, caption = "") {
        return await this._sendPhotosInternal(peerId, filePaths, caption)
    }

    async _sendPhotosInternal(peerId, filePaths, caption) {
        const attachments = await this._resolveAttachments(filePaths)
        return await this.sendAttachments(peerId, attachments, caption)
    }

    // Отправка уже загруженных attachment-строк без повторной загрузки в VK.
    // Используется массовой рассылкой: одна и та же картинка уходит тысячам людей.
    async sendAttachments(peerId, attachments, caption = "") {
        const params = {
            peer_id: peerId,
            message: caption || " ",
            random_id: Math.floor(Math.random() * 1e9),
            attachment: (attachments || []).join(","),
        }
        return await this.api("messages.send", params)
    }

    // Загружает картинки в VK один раз и возвращает готовые attachment-строки.
    async prepareAttachments(filePaths) {
        return await this._resolveAttachments(filePaths)
    }

    async _getLongPollServer() {
        return await this.api("groups.getLongPollServer", { group_id: this.groupId })
    }

    async start() {
        this._running = true
        let lpData = await this._getLongPollServer()
        let { server, key, ts } = lpData
        console.log("[VkBot] Long Poll started")

        while (this._running) {
            try {
                const res = await axios.get(server, {
                    params: { act: "a_check", key, ts, wait: 25 },
                    timeout: 30000,
                })
                const data = res.data

                if (data.failed) {
                    if (data.failed === 1) {
                        ts = data.ts
                    } else {
                        lpData = await this._getLongPollServer()
                        server = lpData.server
                        key = lpData.key
                        ts = lpData.ts
                    }
                    continue
                }

                ts = data.ts

                for (const update of (data.updates || [])) {
                    this._handleUpdate(update).catch(this._errorHandler)
                }
            } catch (e) {
                const isDisconnect = e.code === 'ECONNRESET' || e.code === 'ECONNABORTED' || e.message?.includes('socket hang up')
                if (isDisconnect) {
                    console.log(`[VkBot] Соединение с VK разорвано (${e.code}), переподключаемся...`)
                } else {
                    this._errorHandler(e)
                }
                await new Promise(r => setTimeout(r, 3000))
                try {
                    lpData = await this._getLongPollServer()
                    server = lpData.server
                    key = lpData.key
                    ts = lpData.ts
                    if (isDisconnect) {
                        console.log("[VkBot] Переподключение успешно")
                    }
                } catch (e2) {
                    this._errorHandler(e2)
                }
            }
        }
    }

    stop() { this._running = false }

    async _handleUpdate(update) {
        if (update.type === "message_new") {
            const msg = update.object.message
            const ctx = this._buildMessageCtx(msg)
            for (const h of this._handlers.message) await h(ctx)
        }
        if (update.type === "message_event") {
            const event = update.object
            const ctx = this._buildCallbackCtx(event)
            for (const h of this._handlers.callback) await h(ctx)
        }
    }

    _buildMessageCtx(msg) {
        const bot = this
        let payload = null
        try { if (msg.payload) payload = JSON.parse(msg.payload) } catch(e) {}
        return {
            userId: msg.from_id,
            peerId: msg.peer_id,
            messageId: msg.id,
            text: msg.text,
            payload,
            raw: msg,
            reply: (text, keyboard = null, keyboardRaw = null) => bot.sendMessage(msg.peer_id, text, keyboard, keyboardRaw),
            deleteMessage: (msgId) => bot.deleteMessage(msg.peer_id, msgId || msg.id),
            sendPhotos: (files, caption) => bot._sendPhotosInternal(msg.peer_id, files, caption),
        }
    }

    _buildCallbackCtx(event) {
        const bot = this
        const peerId = event.peer_id
        const userId = event.user_id
        const payload = event.payload || {}
        const callbackData = payload.cmd || ""
        return {
            userId,
            peerId,
            callbackData,
            eventId: event.event_id,
            raw: event,
            reply: async (text, keyboard = null, keyboardRaw = null) => bot.sendMessage(peerId, text, keyboard, keyboardRaw),
            deleteMessage: async (msgId) => { if (msgId) await bot.deleteMessage(peerId, msgId) },
            sendPhotos: (files, caption) => bot._sendPhotosInternal(peerId, files, caption),
            answerEvent: async (text = "") => {
                try {
                    await bot.api("messages.sendMessageEventAnswer", {
                        event_id: event.event_id,
                        user_id: userId,
                        peer_id: peerId,
                        event_data: JSON.stringify({ type: "show_snackbar", text }),
                    })
                } catch(e) {}
            }
        }
    }
}

function buildKeyboard(buttons, oneTime = false) {
    return {
        one_time: oneTime,
        inline: true,
        buttons: buttons.map(row =>
            row.map(btn => ({
                action: {
                    type: "callback",
                    label: btn.text.slice(0, 40),
                    payload: JSON.stringify({ cmd: btn.callback_data }),
                },
                color: "secondary",
            }))
        ),
    }
}

function buildTextKeyboard(buttons, oneTime = true) {
    return {
        one_time: oneTime,
        inline: false,
        buttons: buttons.map(row =>
            row.map(btn => ({
                action: {
                    type: "text",
                    label: btn.text.slice(0, 40),
                },
                color: "secondary",
            }))
        ),
    }
}

module.exports = { VkBot, buildKeyboard }
module.exports.buildTextKeyboard = buildTextKeyboard
