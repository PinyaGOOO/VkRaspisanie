const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const { vk } = require("../cfg.json");
const iconv = require('iconv-lite');
const settings = require("../settings.js")
const storage = require("../helpers/globaldata.js")
                storage.init("vk_comment")
                storage.init("vk_lastupdate")
                storage.set("vk_lastupdate","")
                storage.set("vk_comment","")
const axiosConfig = {
  responseType: 'arraybuffer',
  headers: {
    'User-Agent': vk.userAgent,
    'Cookie':'remixmdevice=1920/1080/1/!!-!!!!!!!!;'
  },
};

const getOffset = async ()=>{
  return new Promise(async (resolve,reject) => {
    await axios.get(vk.schedule.url, axiosConfig).then(async response => {
        const $ = cheerio.load(response.data);
        const offsetNumber = $("#bt_summary").html()
        resolve(offsetNumber)
    })
  })
}

const getLastScheduleData = async ()=>{
  var offset = await getOffset()
  offset = Math.max(Number(offset) - 19,0)
  return new Promise(async (resolve,reject) => {
    var resolvedata = {}
    await axios.get(vk.schedule.url+"?offset="+offset, axiosConfig).then(async response => {
      const buffer = response.data;
      const decodedText = iconv.decode(Buffer.from(buffer), 'windows-1251');
        const $ = cheerio.load(decodedText.toString(),{ decodeEntities: false });
        const listMessages = $('.bp_post.clear_fix ')
        listMessages.each(function(index, element) {
          const message = $(element)
          const messageElement = message.find('a.page_doc_title');
          const link = "https://m.vk.com"+messageElement.attr('href');
        
          const parse_id = link.match(/\/doc(\d+)/)
          if(parse_id){
            const userid = parse_id[1]
            const isvalid = vk.validuserids[userid]
            if (isvalid){
              resolvedata.postcomment = message.find('div.bp_text').text();
              resolvedata.link = link
              resolvedata.postid = message.find('.bp_content').attr('id').slice(-4);
              resolvedata.posttime = message.find('.bp_date').text()
            }
          }
        })
        if(!resolvedata.link){
          console.error("getLastScheduleData: link not find");
          reject()
        }

        resolve(resolvedata)
        storage.set("vk_comment",resolvedata.postcomment)
        storage.set("vk_lastupdate",resolvedata.posttime)
        storage.set("vk_url",resolvedata.link)
    })
  })
}


const downloadFile = async (url) => {
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream',
    headers : axiosConfig.headers
  });
  response.data.pipe(fs.createWriteStream("./files/schedule.xlsx"));
  return new Promise((resolve, reject) => {
    response.data.on('end', () => {
      resolve("./files/schedule.xlsx");// kek 
    });
    response.data.on('error', (err) => {
      reject(err);
    });
  });
}

module.exports.getScheduleLink = ()=>{return settings.get("scheduleurl","")}

module.exports.idle = async (cb) =>{
  setInterval(async () => {
      const data = await getLastScheduleData()
      if( data.posttime != settings.get("posttime","") && data.postid != settings.get("postid","") ){
        settings.set("posttime",data.posttime)
        settings.set("postid",data.postid)
        settings.set("scheduleurl",data.link)
        await cb(data.link)
      }
  }, vk.requestdelay * 1000);
}

module.exports.run = async () =>{
  return new Promise(async (resolve, reject) => {
    const data = await getLastScheduleData()
    if (!data.link){ console.error(`No Link`); return}
    console.log("Скачиваем расписание: ",data.link)
    const filepath = await downloadFile(data.link) 
    if (fs.existsSync(filepath)) {
      console.log("Сохраняем: ",filepath)
      resolve(filepath)//kek2
    } else {
      console.error(`Error download filed ${filepath}`);
      reject()
    }
  })
}


