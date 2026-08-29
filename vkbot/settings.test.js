const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const test = require("node:test")

test("setMany writes all markers in one settings update", async (t) => {
    const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "vkbot-settings-"))
    t.after(() => fs.promises.rm(tempDirectory, { recursive: true, force: true }))

    const tempFiles = path.join(tempDirectory, "files")
    await fs.promises.mkdir(tempFiles)
    await fs.promises.copyFile(path.join(__dirname, "settings.js"), path.join(tempDirectory, "settings.js"))
    await fs.promises.writeFile(
        path.join(tempFiles, "settings.json"),
        JSON.stringify({ deliverymode: "all", postid: "old" }),
    )

    const settings = require(path.join(tempDirectory, "settings.js"))
    settings.setMany({
        postid: "-1014995_7410",
        documentid: "doc6222960_710789171",
        scheduleurl: "https://m.vk.com/doc6222960_710789171?hash=current",
    })

    const stored = JSON.parse(await fs.promises.readFile(path.join(tempFiles, "settings.json"), "utf8"))
    assert.deepEqual(stored, {
        deliverymode: "all",
        postid: "-1014995_7410",
        documentid: "doc6222960_710789171",
        scheduleurl: "https://m.vk.com/doc6222960_710789171?hash=current",
    })
    assert.equal(settings.get("postid"), "-1014995_7410")
    assert.deepEqual(await fs.promises.readdir(tempFiles), ["settings.json"])
})
