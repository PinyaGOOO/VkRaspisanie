const test = require("node:test")
const assert = require("node:assert/strict")

const { VkBot } = require("./vkapi")

test("photo upload retries with a fresh VK upload server", async () => {
    const bot = new VkBot("token", 1)
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

test("photo uploads are serialized across concurrent requests", async () => {
    const bot = new VkBot("token", 1)
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
    ])

    assert.deepEqual(attachments, ["photo-one.jpeg", "photo-two.jpeg", "photo-three.jpeg"])
    assert.equal(maxActive, 1)
})

test("concurrent requests for the same unchanged file share one upload", async () => {
    const bot = new VkBot("token", 1)
    bot._fileMtime = () => 123
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
