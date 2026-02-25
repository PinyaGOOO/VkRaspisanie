/*const { spawn } = require('child_process');
module.exports = async (xlsxfilepath,outfile)=>{
    return new Promise(function(resolve, reject) {

        console.log(__dirname+"/python/run_xlsx2html.py")
        const pyprog = spawn('python',[__dirname+"/python/run_xlsx2html.py",xlsxfilepath,outfile]);
        console.log("Генерируем HTML ",xlsxfilepath,outfile)
        pyprog.stdout.on('data', function(data){
            resolve(data.toString())
        });
        pyprog.stderr.on('data', function(data){
            console.log("Ошибка: ",xlsxfilepath)
            reject(data.toString())
        });
    })
}*/


// тут проще отловить ошибку из питона
const { exec } = require('child_process');
module.exports = async (xlsxfilepath,outfile)=>{
    return new Promise((resolve, reject) => {
        const pythonScriptPath = __dirname+"/python/run_xlsx2html.py";
        //console.log(`'${xlsxfilepath}' '${outfile}'`)
        const command = `python3 '${pythonScriptPath}' '${xlsxfilepath}' '${outfile}'`;
        exec(command,{maxBuffer: 1024 * 1024 * 64}, (error, stdout, stderr) => {
        if (error) {
            console.error(`Ошибка выполнения скрипта: ${error}`);
            return;
        }
        resolve(stdout)
        
        });
    })
}

// python /home/main/data/akych/prk_bot_refactory/modules/python/run_xlsx2html.py ./files/temp/groups/ССК-20-31/1.xlsx ./files/temp/groups/ССК-20-31/1.html
// python /home/main/data/akych/prk_bot_refactory/modules/python/run_xlsx2html.py ./files/temp/people/Эрлих Л.П./1.xlsx ./files/temp/people/Эрлих Л.П./1.html

// ./files/temp/groups/ССА-20-04
// /home/main/data/akych/prk_bot_refactory/modules/python/run_xlsx2html.py
// Генерируем HTML  ./files/temp/groups/ССА-20-04/1.xlsx ./files/temp/groups/ССА-20-04/1.html
// 
// ./files/temp/people/Бабикова С.Н.
// /home/main/data/akych/prk_bot_refactory/modules/python/run_xlsx2html.py
// Генерируем HTML  ./files/temp/people/Бабикова С.Н./1.xlsx ./files/temp/people/Бабикова С.Н./1.html