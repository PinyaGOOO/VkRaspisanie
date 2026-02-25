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
            clearTimeout(this.timers["skiptaskifbug"])
            this.timers["skiptaskifbug"] = setTimeout(() => {
                this.#worker()
                console.log("skipped bad task")
                if (task.ctx) {
                    task.ctx.reply("Не удалось обработать ваш запрос.")
                }
            }, 30000)

            await task.func()
            if (task.userid) {
                if (this.userHasBan(task.userid)) {
                    clearTimeout(this.timers[task.userid])
                    if (task.addbantime) {
                        this.timers[task.userid] = setTimeout(() => { this.userUnBan(task.userid) }, task.addbantime * 1000)
                    } else {
                        this.userUnBan(task.userid)
                    }
                }
            }
            clearTimeout(this.timers["skiptaskifbug"])
            this.#worker()
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
