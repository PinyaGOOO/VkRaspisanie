const GROUP_SUBSCRIPTION_LIMIT = 3

function normalizeGroupSubscriptions(value) {
    const values = Array.isArray(value) ? value : (value ? [value] : [])
    return [...new Set(values.filter(item => typeof item === "string" && item.trim()))]
        .slice(0, GROUP_SUBSCRIPTION_LIMIT)
}

function toggleGroupSubscription(current, value) {
    const groups = normalizeGroupSubscriptions(current)
    if (groups.includes(value)) {
        return { status: "removed", groups: groups.filter(group => group !== value) }
    }
    if (groups.length >= GROUP_SUBSCRIPTION_LIMIT) {
        return { status: "limit", groups }
    }
    return { status: "added", groups: [...groups, value] }
}

function subscriptionItems(subscriptions) {
    const items = []
    for (const [category, rawValue] of Object.entries(subscriptions || {})) {
        const values = Array.isArray(rawValue) ? rawValue : [rawValue]
        for (const value of values) {
            if (typeof value === "string" && value.trim()) items.push({ category, value })
        }
    }
    return items
}

module.exports = {
    GROUP_SUBSCRIPTION_LIMIT,
    normalizeGroupSubscriptions,
    toggleGroupSubscription,
    subscriptionItems,
}
