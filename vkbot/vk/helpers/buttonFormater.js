const VK_MAX_ROWS = 7

function generatePagedButtons(cmd, values, columns, page, backCmd) {
    // Расписание может быть ещё не сгенерировано — тогда storage вернёт undefined.
    if (!Array.isArray(values)) values = []
    const perPage = VK_MAX_ROWS * columns
    const totalPages = Math.ceil(values.length / perPage)
    const start = page * perPage
    const slice = values.slice(start, start + perPage)

    const rows = []
    for (let i = 0; i < slice.length; i += columns) {
        const row = []
        for (let j = 0; j < columns && i + j < slice.length; j++) {
            const val = slice[i + j]
            // Элемент может быть строкой или { label, value } — label только для
            // отображения (напр. с «✅»), а arg должен содержать чистое значение.
            const label = (val && typeof val === "object") ? val.label : val
            const arg = (val && typeof val === "object") ? val.value : val
            row.push({
                action: {
                    type: "text",
                    label: String(label).slice(0, 40),
                    payload: JSON.stringify({ cmd, arg })
                },
                color: "primary"
            })
        }
        rows.push(row)
    }

    if (totalPages > 1) {
        const navRow = []
        if (page > 0) {
            navRow.push({
                action: {
                    type: "text",
                    label: "< Пред.",
                    payload: JSON.stringify({ cmd: "page", arg: cmd, data: { page: page - 1, backCmd, columns } })
                },
                color: "secondary"
            })
        }
        navRow.push({
            action: {
                type: "text",
                label: `${page + 1}/${totalPages}`,
                payload: JSON.stringify({ cmd: "noop" })
            },
            color: "secondary"
        })
        if (page < totalPages - 1) {
            navRow.push({
                action: {
                    type: "text",
                    label: "След. >",
                    payload: JSON.stringify({ cmd: "page", arg: cmd, data: { page: page + 1, backCmd, columns } })
                },
                color: "secondary"
            })
        }
        rows.push(navRow)
    }

    return rows
}

function buildKeyboard(rows, oneTime = false) {
    return JSON.stringify({ one_time: oneTime, buttons: rows })
}

module.exports = { generatePagedButtons, buildKeyboard }
