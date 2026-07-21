const axios = require("axios")
const cheerio = require("cheerio")
const fs = require("fs")
const path = require("path")
const { execFile } = require("child_process")
const { buildKeyboard } = require("../helpers/buttonFormater.js")
const { vk } = require("../../cfg.json")
const iconv = require("iconv-lite")

const TOPIC_URL = "https://vk.com/topic-1014995_53953767"
const DOWNLOAD_DIR = "./files/temp/consultations"
const PDF_PATH = "./files/temp/consultations/consultation.pdf"
const LINK_CACHE_PATH = "./files/temp/consultations/last_link.txt"

const axiosConfig = {
    responseType: "arraybuffer",
    headers: {
        "User-Agent": vk.userAgent,
        "Cookie": "remixmdevice=1920/1080/1/!!-!!!!!!!!;"
    }
}

const backRow = [[{
    action: { type: "text", label: "< Назад", payload: JSON.stringify({ cmd: "redirect", arg: "start" }) },
    color: "secondary"
}]]

const getLastPdfLink = async () => {
    const response = await axios.get(TOPIC_URL, axiosConfig)
    const decoded = iconv.decode(Buffer.from(response.data), "windows-1251")
    const $ = cheerio.load(decoded, { decodeEntities: false })

    let lastLink = null
    $("a").each((i, el) => {
        const href = $(el).attr("href") || ""
        if (href.includes("/doc")) {
            lastLink = "https://m.vk.com" + href.split("?")[0] + "?" + href.split("?")[1]
        }
    })

    return lastLink
}

const downloadPdf = async (url) => {
    if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })

    const response = await axios({ method: "GET", url, responseType: "stream", headers: axiosConfig.headers })

    const contentType = response.headers["content-type"] || ""
    if (contentType.includes("text/html")) {
        throw new Error("VK вернул HTML вместо PDF — возможно истёк hash ссылки")
    }

    const writer = fs.createWriteStream(PDF_PATH)
    response.data.pipe(writer)

    return new Promise((resolve, reject) => {
        writer.on("finish", resolve)
        writer.on("error", reject)
    })
}

const convertToImages = async () => {
    const imgDir = DOWNLOAD_DIR + "/images"
    if (!fs.existsSync(imgDir)) fs.mkdirSync(imgDir, { recursive: true })
    fs.readdirSync(imgDir).forEach(f => fs.unlinkSync(path.join(imgDir, f)))

    return new Promise((resolve, reject) => {
        const script = path.join(__dirname, "../../modules/python/pdf2images.py")
        execFile("python3", [script, PDF_PATH, imgDir], { maxBuffer: 1024 * 1024 * 64 }, (err, stdout) => {
            if (err) { reject(err); return }
            const files = stdout.trim().split("\n").filter(Boolean)
            resolve(files)
        })
    })
}

const getImages = async () => {
    const imgDir = DOWNLOAD_DIR + "/images"

    // Проверяем есть ли уже картинки
    if (fs.existsSync(imgDir)) {
        const cached = fs.readdirSync(imgDir).filter(f => f.endsWith(".jpeg"))
        if (cached.length > 0) {
            return cached.sort().map(f => path.join(imgDir, f))
        }
    }

    return null
}

module.exports = {
    desc: "График консультаций",
    callback: async (ctx) => {
        await ctx.reply("Загружаем график консультаций...", null, buildKeyboard(backRow))

        try {
            const pdfLink = await getLastPdfLink()
            console.log("[consultations] найдена ссылка:", pdfLink)

            if (!pdfLink) {
                await ctx.reply("Не удалось найти файл в обсуждении.", null, buildKeyboard(backRow))
                return
            }

            // Проверяем изменилась ли ссылка с прошлого раза
            const docId = pdfLink.match(/\/doc(\d+_\d+)/)?.[1]
            const cachedId = fs.existsSync(LINK_CACHE_PATH) ? fs.readFileSync(LINK_CACHE_PATH, "utf8").trim() : ""
            const isNew = docId !== cachedId

            if (isNew) {
                console.log("[consultations] новый файл, скачиваем...")
                await downloadPdf(pdfLink)
                await convertToImages()
                if (docId) fs.writeFileSync(LINK_CACHE_PATH, docId)
                console.log("[consultations] готово")
            } else {
                console.log("[consultations] файл не изменился, используем кэш")
            }

            const images = await getImages()

            if (!images || images.length === 0) {
                await ctx.reply("Не удалось получить изображения.", null, buildKeyboard(backRow))
                return
            }

            await ctx.sendPhotos(images, "График консультаций")
        } catch (e) {
            console.error("[consultations] ошибка:", e.message)
            await ctx.reply("Произошла ошибка, попробуйте позже.", null, buildKeyboard(backRow))
        }
    }
}
