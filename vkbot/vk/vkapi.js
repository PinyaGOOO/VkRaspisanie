/**
 * Минималистичный VK Bot на Long Poll API
 * Эмулирует интерфейс grammy для простой замены
 */

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
    }

    // ---- Регистрация обработчиков ----
    on(event, handler) {
        this._handlers[event].push(handler)
    }
    catch(handler) {
        this._errorHandler = handler
    }

    // ---- VK API calls ----
    async api(method, params = {}) {
        const url = VK_API + method
        const res = await axios.get(url, {
            params: {
                ...params,
                access_token: this.token,
                v: API_VER,
            },
            timeout: 15000,
        })
        if (res.data.error) {
            const err = new Error(`VK API Error ${res.data.error.error_code}: ${res.data.error.error_msg}`)
            err.code = res.data.error.error_code
            throw err
        }
        return res.data.response
    }

    // Отправить сообщение
    async sendMessage(peerId, text, keyboard = null) {
        const params = {
            peer_id: peerId,
            message: text || " ",
            random_id: Math.floor(Math.random() * 1e9),
        }
        if (keyboard) {
            params.keyboard = JSON.stringify(keyboard)
        }
        return await this.api("messages.send", params)
    }

    // Удалить сообщение
    async deleteMessage(peerId, messageId) {
        try {
            await this.api("messages.delete", {
                peer_id: peerId,
                message_ids: messageId,
                delete_for_all: 1,
            })
        } catch(e) {
            // Игнорируем ошибки удаления (нет прав и т.д.)
        }
    }

    // Загрузить и отправить фото
    async uploadPhoto(filePath) {
        // 1. Получить сервер загрузки
        const uploadServer = await this.api("photos.getMessagesUploadServer", {})
        
        // 2. Загрузить файл
        const form = new FormData()
        form.append("photo", fs.createReadStream(filePath))
        const uploadRes = await axios.post(uploadServer.upload_url, form, {
            headers: form.getHeaders(),
            timeout: 30000,
        })
        
        // 3. Сохранить фото
        const saved = await this.api("photos.saveMessagesPhoto", {
            photo: uploadRes.data.photo,
            server: uploadRes.data.server,
            hash: uploadRes.data.hash,
        })
        return `photo${saved[0].owner_id}_${saved[0].id}`
    }

    // Отправить несколько фото с подписью
    async sendPhotos(peerId, filePaths, caption = "") {
        const attachments = []
        for (const fp of filePaths) {
            const attach = await this.uploadPhoto(fp)
            attachments.push(attach)
        }
        return await this.sendMessage(peerId, caption, null, attachments)
    }

    // sendPhotos с attachment
    async _sendPhotosInternal(peerId, filePaths, caption) {
        const attachments = []
        for (const fp of filePaths) {
            const attach = await this.uploadPhoto(fp)
            attachments.push(attach)
        }
        const params = {
            peer_id: peerId,
            message: caption || " ",
            random_id: Math.floor(Math.random() * 1e9),
            attachment: attachments.join(","),
        }
        return await this.api("messages.send", params)
    }

    // ---- Long Poll ----
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
                this._errorHandler(e)
                await new Promise(r => setTimeout(r, 3000))
                try {
                    lpData = await this._getLongPollServer()
                    server = lpData.server
                    key = lpData.key
                    ts = lpData.ts
                } catch (e2) {
                    this._errorHandler(e2)
                }
            }
        }
    }

    stop() {
        this._running = false
    }

    async _handleUpdate(update) {
        if (update.type === "message_new") {
            const msg = update.object.message
            const ctx = this._buildMessageCtx(msg)
            for (const h of this._handlers.message) {
                await h(ctx)
            }
        }

        if (update.type === "message_event") {
            const event = update.object
            const ctx = this._buildCallbackCtx(event)
            for (const h of this._handlers.callback) {
                await h(ctx)
            }
        }
    }

    _buildMessageCtx(msg) {
        const bot = this
        return {
            userId: msg.from_id,
            peerId: msg.peer_id,
            messageId: msg.id,
            text: msg.text,
            raw: msg,

            reply: (text, keyboard = null) => bot.sendMessage(msg.peer_id, text, keyboard),
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

            reply: async (text, keyboard = null) => {
                return await bot.sendMessage(peerId, text, keyboard)
            },
            deleteMessage: async (msgId) => {
                if (msgId) {
                    await bot.deleteMessage(peerId, msgId)
                }
            },
            sendPhotos: (files, caption) => bot._sendPhotosInternal(peerId, files, caption),
            answerEvent: async (text = "") => {
                // Снять "загрузку" с кнопки
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

// ---- Построитель клавиатур VK ----
// Возвращает объект keyboard для VK
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

module.exports = { VkBot, buildKeyboard }
