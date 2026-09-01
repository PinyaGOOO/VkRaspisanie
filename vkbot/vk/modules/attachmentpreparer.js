async function mapLimit(items, limit, fn) {
    let index = 0
    const worker = async () => {
        while (index < items.length) {
            const current = index++
            await fn(items[current], current)
        }
    }
    const workers = Math.max(1, Math.min(limit, items.length))
    await Promise.all(Array.from({ length: workers }, worker))
}

function generateInQueue(tasker, getimages, value, category) {
    return new Promise(resolve => {
        tasker.add({
            func: async () => {
                try {
                    resolve({ images: await getimages(value, "/" + category) })
                } catch (error) {
                    resolve({ error })
                }
            }
        })
    })
}

// Puppeteer остаётся однопоточным внутри tasker, а загрузка уже созданных JPEG
// выполняется снаружи очереди. Несколько workers образуют небольшой конвейер:
// пока VK принимает предыдущие фото, генератор готовит следующее расписание.
async function prepareUnique({
    uniqueItems,
    bot,
    tasker,
    getimages,
    isStopped = () => false,
    concurrency = 4,
    logger = console,
}) {
    const prepared = new Map()
    const cacheBefore = bot.getPhotoCacheStats ? bot.getPhotoCacheStats() : null
    let aborted = false

    await mapLimit([...uniqueItems], concurrency, async ([key, { category, value }]) => {
        if (aborted) return
        if (isStopped()) {
            aborted = true
            return
        }

        const generated = await generateInQueue(tasker, getimages, value, category)
        if (generated.error) {
            prepared.set(key, null)
            logger.error(`[delivery] ошибка генерации ${key}:`, generated.error?.message || generated.error)
            return
        }
        if (!generated.images || generated.images.length === 0) {
            prepared.set(key, null)
            logger.log(`[delivery] нет картинок для ${key}`)
            return
        }

        try {
            const attachments = await bot.prepareAttachments(generated.images)
            prepared.set(key, { attachments, caption: `Расписание для ${value}` })
        } catch (error) {
            prepared.set(key, null)
            logger.error(`[delivery] ошибка подготовки ${key}:`, error?.message || error)
        }
    })

    if (aborted) {
        logger.log("[delivery] идёт генерация расписания — подготовка прервана")
        return { prepared, aborted: true }
    }

    const cacheAfter = bot.getPhotoCacheStats ? bot.getPhotoCacheStats() : null
    if (cacheBefore && cacheAfter) {
        logger.log(
            `[delivery] вложения: новых загрузок VK ${cacheAfter.uploads - cacheBefore.uploads}, ` +
            `из кэша ${cacheAfter.pathHits + cacheAfter.contentHits - cacheBefore.pathHits - cacheBefore.contentHits}, ` +
            `в постоянном кэше ${cacheAfter.persistentEntries}`
        )
    }
    return { prepared, aborted: false }
}

module.exports = { prepareUnique }
