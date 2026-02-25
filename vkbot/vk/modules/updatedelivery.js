const db = require("../../database/db.js")
const storage = require("../../helpers/globaldata.js")
const tasker = require("../requestqueue.js")
const getimages = require("../../modules/getimagebyname.js")
const { vk } = require("../../cfg.json")
const settings = require("../../settings.js")

const setAllUsersMailTrue = async () => {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE users SET mail = TRUE WHERE subscribes != '{}'`, (err) => {
            if (err) { reject(err) } else { resolve() }
        })
    })
}

const getUsersWithMail = async () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT userid, subscribes FROM users WHERE mail = TRUE LIMIT 1`, (err, rows) => {
            if (err) { reject(err) } else { resolve(rows) }
        })
    })
}

const updateUserMailFalse = async (userid) => {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE users SET mail = FALSE WHERE userid = ?`, [userid], (err) => {
            if (err) { reject(err) } else { resolve() }
        })
    })
}

let worker
worker = async () => {
    const mode = settings.get("deliverymode", "all")
    if (mode === "off") return

    const user = await getUsersWithMail()
    if (!user || !user[0] || storage.get("telegram_stop")) {
        console.log("stop delivery")
        return
    }

    await updateUserMailFalse(user[0].userid)
    const userID = user[0].userid
    let send = true

    if (mode === "admins") {
        send = vk.admins && vk.admins[userID]
    }

    if (send) {
        let subs = user[0].subscribes
        if (subs && subs !== "{}") {
            subs = JSON.parse(subs)
            let incrementer = 0

            for (const key in subs) {
                const item_name = subs[key]
                tasker.add({
                    userid: userID,
                    func: async () => {
                        incrementer++
                        try {
                            const images = await getimages(item_name, "/" + key)
                            const bot = storage.get("bot")
                            await bot._sendPhotosInternal(userID, images, `Расписание для ${item_name}`)
                            if (incrementer >= Object.keys(subs).length) {
                                await bot.sendMessage(userID,
                                    `Изменения в расписании\n\n${storage.get("vk_comment") || ""}\n\nОбновлено: ${storage.get("vk_lastupdate") || "—"}`)
                            }
                        } catch (error) {
                            console.log("Ошибка в рассылке расписания!!!", error)
                        }
                    }
                })
            }
        }
    }

    tasker.add({ func: worker })
}

module.exports.start = async () => {
    await setAllUsersMailTrue()
    tasker.add({ func: worker })
}
