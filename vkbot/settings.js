const fs = require("fs")
const path = require("path")

const settingsPath = path.join(__dirname, "files", "settings.json")
const tempSettingsPath = `${settingsPath}.${process.pid}.tmp`
fs.mkdirSync(path.dirname(settingsPath), { recursive: true })
if (!fs.existsSync(settingsPath)) fs.writeFileSync(settingsPath, "{}")
const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"))

const save = (nextSettings)=>{
    const currentStat = fs.statSync(settingsPath)
    try {
        fs.writeFileSync(tempSettingsPath, JSON.stringify(nextSettings), { mode: currentStat.mode })
        try {
            fs.chownSync(tempSettingsPath, currentStat.uid, currentStat.gid)
        } catch (_) {
            // Windows и непривилегированный запуск могут не разрешать chown; содержимое уже записано.
        }
        fs.renameSync(tempSettingsPath, settingsPath)
    } catch (error) {
        try { fs.unlinkSync(tempSettingsPath) } catch (_) {}
        throw error
    }
}

module.exports.set = (id,val)=>{
    const nextSettings = { ...settings, [id]: val }
    save(nextSettings)
    Object.assign(settings, nextSettings)
}

module.exports.setMany = (values)=>{
    const nextSettings = { ...settings, ...values }
    save(nextSettings)
    Object.assign(settings, nextSettings)
}

module.exports.get = (id,def)=>{
    if(!Object.prototype.hasOwnProperty.call(settings, id)) return def
    return settings[id]
}
