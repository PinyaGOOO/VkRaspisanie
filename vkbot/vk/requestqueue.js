// to fix single thread puppeteer generation
class queue {
    constructor() {
        this.queue = []
        this.idle = true
        this.bannedusers = {}
        this.timers = {}
    }

    add(task) {
        if (task.userid) {
            clearTimeout(this.timers[task.userid])
            this.timers[task.userid] = setTimeout(() => { this.userUnBan(task.userid) }, 10000)
            this.userBan(task.userid)
        }
        this.queue.push(task)
        this.#startworker()
        return true
    }
    #get() {
        return this.queue.shift()
    }
    #count() {
        return this.queue.length
    }
    #startworker() {
        if (!this.idle) return
        this.idle = false
        this.#worker()
    }
    async #worker() {
        if (this.#count() > 0) {
            const task = this.#get()

            // Переход к следующей задаче должен произойти РОВНО один раз:
            // либо задача завершилась (успешно/с ошибкой), либо сработал таймаут.
            // Иначе два «worker»-а начинают крутить очередь параллельно и
            // ломают однопоточную генерацию (общий Puppeteer page).
            let advanced = false
            let skipTimer = null
            const advance = () => {
                if (advanced) return
                advanced = true
                clearTimeout(skipTimer)
                this.#worker()
            }

            skipTimer = setTimeout(() => {
                console.log("skipped bad task")
                if (task.ctx) {
                    try { task.ctx.reply("Не удалось обработать ваш запрос.") } catch (e) {}
                }
                advance()
            }, 120000)

            // Без try/catch отклонённый промис задачи убивал всю очередь.
            try {
                await task.func()
            } catch (e) {
                console.error("[queue] Ошибка задачи:", e?.message || e)
            }

            if (task.userid && this.userHasBan(task.userid)) {
                clearTimeout(this.timers[task.userid])
                if (task.addbantime) {
                    this.timers[task.userid] = setTimeout(() => { this.userUnBan(task.userid) }, task.addbantime * 1000)
                } else {
                    this.userUnBan(task.userid)
                }
            }

            advance()
        } else {
            this.idle = true
        }
    }

    userUnBan(id) { this.bannedusers[id] = null }
    userBan(id) { this.bannedusers[id] = true }
    userHasBan(id) { return this.bannedusers[id] }
}

const tasker = new queue()
module.exports = tasker
