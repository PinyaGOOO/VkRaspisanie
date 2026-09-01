const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const axios = require("axios")

const { VkBot } = require("./vkapi")

test("VK API network errors do not expose request data with the access token", async () => {
    const bot = new VkBot("super-secret-token", 1, { photoCacheFile: null })
    const originalPost = axios.post
    axios.post = async () => {
        const error = new Error("timeout")
        error.code = "ECONNABORTED"
        error.config = { data: "access_token=super-secret-token" }
        throw error
    }

    try {
        await assert.rejects(
            () => bot.api("messages.send", { peer_id: 1 }),
            error => {
                assert.equal(error.message, "VK API messages.send: ECONNABORTED")
                assert.equal(error.config, undefined)
                assert.equal(error.message.includes("super-secret-token"), false)
                return true
            }
        )
    } finally {
        axios.post = originalPost
    }
})

test("photo upload retries with a fresh VK upload server", async () => {
    const bot = new VkBot("token", 1, { photoCacheFile: null })
    bot._photoUploadRetryDelays = [0, 0]

    let serverCalls = 0
    let uploadCalls = 0
    bot.api = async method => {
        assert.equal(method, "photos.getMessagesUploadServer")
        serverCalls += 1
        return { upload_url: `upload-${serverCalls}` }
    }
    bot._uploadToServer = async (filePath, uploadUrl) => {
        assert.equal(filePath, "schedule.jpeg")
        uploadCalls += 1
        if (uploadCalls < 3) throw new Error("empty photo")
        return `photo-from-${uploadUrl}`
    }

    const originalWarn = console.warn
    console.warn = () => {}
    try {
        const attachment = await bot._uploadWithRetry("schedule.jpeg")
        assert.equal(attachment, "photo-from-upload-3")
        assert.equal(serverCalls, 3)
        assert.equal(uploadCalls, 3)
    } finally {
        console.warn = originalWarn
    }
})

test("photo uploads use bounded concurrency across requests", async () => {
    const bot = new VkBot("token", 1, { photoCacheFile: null, photoUploadConcurrency: 3 })
    let active = 0
    let maxActive = 0
    let serverCalls = 0

    bot.api = async () => ({ upload_url: `upload-${++serverCalls}` })
    bot._uploadToServer = async filePath => {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise(resolve => setTimeout(resolve, 10))
        active -= 1
        return `photo-${filePath}`
    }

    const attachments = await Promise.all([
        bot._uploadWithRetry("one.jpeg"),
        bot._uploadWithRetry("two.jpeg"),
        bot._uploadWithRetry("three.jpeg"),
        bot._uploadWithRetry("four.jpeg"),
        bot._uploadWithRetry("five.jpeg"),
        bot._uploadWithRetry("six.jpeg"),
    ])

    assert.deepEqual(attachments, [
        "photo-one.jpeg", "photo-two.jpeg", "photo-three.jpeg",
        "photo-four.jpeg", "photo-five.jpeg", "photo-six.jpeg",
    ])
    assert.equal(maxActive, 3)
})

test("concurrent requests for the same unchanged file share one upload", async () => {
    const bot = new VkBot("token", 1, { photoCacheFile: null })
    bot._fileMtime = () => 123
    bot._fileHash = () => "same-hash"
    let uploadCalls = 0
    bot._uploadWithRetry = async filePath => {
        uploadCalls += 1
        await new Promise(resolve => setTimeout(resolve, 10))
        return `photo-${filePath}`
    }

    const [first, second] = await Promise.all([
        bot.prepareAttachments(["same.jpeg"]),
        bot.prepareAttachments(["same.jpeg"]),
    ])

    assert.deepEqual(first, ["photo-same.jpeg"])
    assert.deepEqual(second, first)
    assert.equal(uploadCalls, 1)
})

test("identical image content is uploaded once and reused after restart", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vkbot-photo-cache-"))
    const cacheFile = path.join(tempDir, "attachments.json")
    const firstFile = path.join(tempDir, "first.jpeg")
    const secondFile = path.join(tempDir, "second.jpeg")
    fs.writeFileSync(firstFile, "identical-image")
    fs.writeFileSync(secondFile, "identical-image")

    try {
        const firstBot = new VkBot("token", 1, { photoCacheFile: cacheFile })
        let uploadCalls = 0
        firstBot._uploadWithRetry = async () => {
            uploadCalls++
            return "photo-1_2"
        }

        const firstResult = await firstBot.prepareAttachments([firstFile, secondFile])
        assert.deepEqual(firstResult, ["photo-1_2", "photo-1_2"])
        assert.equal(uploadCalls, 1)

        const restartedBot = new VkBot("token", 1, { photoCacheFile: cacheFile })
        restartedBot._uploadWithRetry = async () => {
            throw new Error("persistent cache was not used")
        }
        assert.deepEqual(await restartedBot.prepareAttachments([secondFile]), ["photo-1_2"])
        assert.equal(restartedBot.getPhotoCacheStats().contentHits, 1)
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true })
    }
})
