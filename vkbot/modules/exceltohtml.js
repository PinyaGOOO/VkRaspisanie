const { execFile } = require('child_process');
const path = require('path');

module.exports = async (xlsxfilepath, outfile) => {
    return new Promise((resolve, reject) => {
        const pythonScriptPath = path.join(__dirname, "/python/run_xlsx2html.py");
        // execFile передаёт аргументы напрямую без shell — безопасно от инъекций
        // и промис теперь корректно завершается при ошибке
        execFile('python3', [pythonScriptPath, xlsxfilepath, outfile], { maxBuffer: 1024 * 1024 * 64 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`Ошибка выполнения скрипта: ${error}`);
                reject(error)
                return;
            }
            resolve(stdout)
        });
    })
}
