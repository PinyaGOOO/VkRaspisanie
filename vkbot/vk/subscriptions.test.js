const test = require("node:test")
const assert = require("node:assert/strict")

const {
    normalizeGroupSubscriptions,
    toggleGroupSubscription,
    subscriptionItems,
} = require("./subscriptions.js")

test("legacy single group subscription is normalized without data loss", () => {
    assert.deepEqual(normalizeGroupSubscriptions("КСК-24-01"), ["КСК-24-01"])
})

test("up to three distinct group subscriptions can be added", () => {
    let groups = "КСК-24-01"
    groups = toggleGroupSubscription(groups, "КСК-24-02").groups
    const result = toggleGroupSubscription(groups, "КСК-24-03")

    assert.equal(result.status, "added")
    assert.deepEqual(result.groups, ["КСК-24-01", "КСК-24-02", "КСК-24-03"])
})

test("fourth group is rejected and selected group can be removed", () => {
    const groups = ["КСК-24-01", "КСК-24-02", "КСК-24-03"]
    const limited = toggleGroupSubscription(groups, "КСК-24-04")
    const removed = toggleGroupSubscription(groups, "КСК-24-02")

    assert.equal(limited.status, "limit")
    assert.deepEqual(limited.groups, groups)
    assert.equal(removed.status, "removed")
    assert.deepEqual(removed.groups, ["КСК-24-01", "КСК-24-03"])
})

test("delivery expands group arrays and keeps legacy scalar categories", () => {
    assert.deepEqual(subscriptionItems({
        groups: ["КСК-24-01", "КСК-24-02"],
        people: "Иванов И.И.",
    }), [
        { category: "groups", value: "КСК-24-01" },
        { category: "groups", value: "КСК-24-02" },
        { category: "people", value: "Иванов И.И." },
    ])
})
