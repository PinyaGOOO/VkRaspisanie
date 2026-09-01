const test = require("node:test")
const assert = require("node:assert/strict")

const { prepareUnique } = require("./attachmentpreparer.js")

function serialTasker() {
    let tail = Promise.resolve()
    return {
        add(task) {
            tail = tail.then(task.func)
        }
    }
}

test("generation continues while previous schedule uploads", async () => {
    const events = []
    const result = await prepareUnique({
        uniqueItems: new Map([
            ["groups/A", { category: "groups", value: "A" }],
            ["groups/B", { category: "groups", value: "B" }],
        ]),
        tasker: serialTasker(),
        getimages: async value => {
            events.push(`generate-start-${value}`)
            await new Promise(resolve => setTimeout(resolve, 5))
            events.push(`generate-end-${value}`)
            return [`${value}.jpeg`]
        },
        bot: {
            prepareAttachments: async images => {
                const value = images[0][0]
                events.push(`upload-start-${value}`)
                await new Promise(resolve => setTimeout(resolve, 30))
                events.push(`upload-end-${value}`)
                return [`photo-${value}`]
            }
        },
        concurrency: 2,
        logger: { log() {}, error() {} },
    })

    assert.equal(result.aborted, false)
    assert.equal(result.prepared.size, 2)
    assert.ok(events.indexOf("generate-start-B") < events.indexOf("upload-end-A"))
})

test("one failed schedule does not stop the preparation pipeline", async () => {
    const errors = []
    const result = await prepareUnique({
        uniqueItems: new Map([
            ["groups/A", { category: "groups", value: "A" }],
            ["groups/B", { category: "groups", value: "B" }],
        ]),
        tasker: serialTasker(),
        getimages: async value => {
            if (value === "A") throw new Error("broken image")
            return ["B.jpeg"]
        },
        bot: { prepareAttachments: async () => ["photo-B"] },
        concurrency: 2,
        logger: { log() {}, error: (...args) => errors.push(args.join(" ")) },
    })

    assert.equal(result.prepared.get("groups/A"), null)
    assert.deepEqual(result.prepared.get("groups/B").attachments, ["photo-B"])
    assert.equal(errors.length, 1)
})

test("stop signal aborts before new schedules enter the queue", async () => {
    let queued = 0
    const result = await prepareUnique({
        uniqueItems: new Map([["groups/A", { category: "groups", value: "A" }]]),
        tasker: { add() { queued++ } },
        getimages: async () => [],
        bot: {},
        isStopped: () => true,
        logger: { log() {}, error() {} },
    })

    assert.equal(result.aborted, true)
    assert.equal(queued, 0)
})
