const storage = require("../helpers/globaldata.js")
      storage.init("bot")
const getimages = require("../modules/getimagebyname.js")
const tasker = require("./requestqueue.js")
const { VkBot } = require("./vkapi.js")
const { vk } = require("../cfg.json")
const fs = require('fs')

const bot = new VkBot(vk.token, vk.groupId)
storage.set("bot", bot)

const commandscache = {}
const commandfunccache = {}

function registerCommands() {
    const commandFiles = fs.readdirSync(__dirname + '/commands').filter(f => f.endsWith('.js'))
    for (const file of commandFiles) {
        const commandName = file.split('.')[0]
        const commandData = require(`./commands/${file}`)
        commandscache[commandName] = commandData
    }

    const commandFuncFiles = fs.readdirSync(__dirname + '/commands_func').filter(f => f.endsWith('.js'))
    for (const file of commandFuncFiles) {
        const func_id = file.split('.')[0]
        const func_data = require(`./commands_func/${file}`)
        commandfunccache[func_id] = func_data
    }
}

async function handleMessage(ctx) {
    const text = (ctx.text || "").trim().toLowerCase()

    // Handle commands
    if (text === "начать" || text === "/start" || text === "start") {
        if (commandscache["start"]) {
            await commandscache["start"].callback(ctx)
        }
        return
    }

    // Delete unknown messages (same as TG version)
    // In VK we just ignore them
}

async function handleCallback(ctx) {
    if (storage.get("telegram_stop")) {
        await ctx.reply("Генерируем данные! Ваш запрос не может быть обработан!\n\nПопробуйте снова через 30 секунд.")
        return
    }

    const data = ctx.callbackData
    const userID = ctx.userId

    console.log("requestfrom:", userID, data)

    if (data.startsWith('groups:')) {
        const group = data.split(':')[1]
        if (tasker.userHasBan(userID)) return
        const msg = await ctx.reply(`Обрабатываем ваш запрос... (Расписание ${group})`)
        tasker.add({
            ctx,
            userid: userID,
            addbantime: 1,
            func: async () => {
                const images = await getimages(group, "/groups")
                await ctx.sendPhotos(images, `Расписание для ${group}`)
                await ctx.deleteMessage(msg)
            }
        })
    }

    if (data.startsWith('peoples:')) {
        const people = data.split(':')[1]
        if (tasker.userHasBan(userID)) return
        const msg = await ctx.reply(`Обрабатываем ваш запрос... (Расписание ${people})`)
        tasker.add({
            ctx,
            userid: userID,
            addbantime: 1,
            func: async () => {
                const images = await getimages(people, "/people")
                await ctx.sendPhotos(images, `Расписание для ${people}`)
                await ctx.deleteMessage(msg)
            }
        })
    }

    if (data.startsWith('rooms:')) {
        const room = data.split(':')[1]
        if (tasker.userHasBan(userID)) return
        const msg = await ctx.reply(`Обрабатываем ваш запрос... (Расписание для ${room})`)
        tasker.add({
            ctx,
            userid: userID,
            addbantime: 1,
            func: async () => {
                const images = await getimages(room, "/rooms")
                await ctx.sendPhotos(images, `Расписание для ${room}`)
                await ctx.deleteMessage(msg)
            }
        })
    }

    if (data.startsWith('func:')) {
        const args = data.split(':')
        if (!commandfunccache[args[1]]) return
        const argumentsArray = args.slice(1)
        commandfunccache[args[1]].func(ctx, ...argumentsArray)
    }

    if (data.startsWith('redirect:')) {
        const command = data.split(':')[1]
        if (!commandscache[command]) return
        commandscache[command].callback(ctx)
    }
}

function startBot() {
    registerCommands()

    bot.on('message', handleMessage)
    bot.on('callback', handleCallback)

    bot.catch((err) => {
        console.error(err)
    })

    bot.start()
    console.log("VK Bot started!")
}

startBot()
