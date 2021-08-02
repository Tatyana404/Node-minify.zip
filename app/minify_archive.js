const path = require('path')
const uploadsDir = path.join(__dirname, '../')
const formidable = require('formidable') //анализ данных формы(загружаемых файлов)

const fs = require('fs')
const mv = require('mv') // альтернатива fs.rename
const extractZip = require('extract-zip')
const zipFolder = require('zip-folder') //извлекает zip-архив в каталог

const CleanCSS = require('clean-css') //оптимизатор CSS
const UglifyJS = require('uglify-js') //синтаксический анализ, минификация, сжатие и улучшение JS
const HtmlMinifier = require('html-minifier') //HTML-минификатор на основе JS

const { css_options, html_options, js_options } = require('../middleware')

function archive_upload (req, res) {
  let form = new formidable.IncomingForm() //Создание новой входящей формы
  //анализирует входящий запрос содержащий данные формы. При наличии cb все поля и файлы собираются и передаются в обратный вызов:
  form.parse(req, function (err, fields, files) {
    if (files.project_archive) {
      let file = files.project_archive.name, //возвращает полное имя загружаемого архива
        file_ext = path.extname(file), // возвращает расширение загружаемого архива (.zip)
        file_name = path.basename(file, file_ext), //возвращает часть имени файла (без расширения)
        old_path = files.project_archive.path, //папка для временных файлов /tmp/...
        new_path = path.join(uploadsDir, file) //создаем новый путь из указанной папки для загрузки+имя архива
      //переименование файла по заданному старому пути в заданный новый путь
      mv(old_path, new_path, function (err) {
        if (err) throw err

        console.log('Загружен архив')

        let extract_path = path.join(uploadsDir, file_name) //путь для разархивации(корень проекта+имя загружаемого файла)
        //выгрузить данные по новому указаному пути
        archive_extract(file, extract_path).then(function () {
          console.log('Разархивировано')
          // минифицировать данные в папке по указанному пути и добавить к имени .min.zip
          mification_folder(extract_path).then(function () {
            console.log('Минифицировано')

            let zip_path = extract_path + '.min.zip'
            //заархивировать минифицированные данные по указанному пути c заданным именем
            zipFolder(extract_path, zip_path, function (err) {
              if (err) throw err

              console.log('Создан новый архив с минифицированными данными')

              remove_by_path(extract_path) //удаление папки разархивации
              remove_by_path(new_path) //удаление загруженного архива

              console.log('Готово')
            })
          })
        })
      })
    }
    res.end() //завершить процесс
  })
}

//принимает архив и путь и выгружает данные архива по нему
async function archive_extract (archive_path, extract_path) {
  await extractZip(archive_path, { dir: extract_path }, function (err) {
    if (err) throw err
  })
}

//принимает путь к разархивированной папке и считывает её
async function mification_folder (minify_path) {
  let files = fs.readdirSync(minify_path),
    promises = []

  files.forEach(function (file, i) {
    promises[i] = new Promise(async function (resolve, reject) {
      let file_path = minify_path + '/' + file //путь к файлам (папка в папке)
      //Возвращает true если объект описывает каталог файловой системы.
      if (fs.lstatSync(file_path).isDirectory()) {
        mification_folder(file_path) //минифицировать папку  по указанному пути
      } else {
        await minify_file(file_path) //минифицировать файлы по указанному пути
      }
      resolve() //разрешить промис как удачный
    })
  })

  return await Promise.all(promises) //вернуть промис со всем добром
}

//преобразование файлов по всем указанным параметрам
//принимает данные файла и расширение
function get_minified_code (code, ext) {
  let minify_fns = {
    css: function (code) {
      //применить указанные опции к данным css и вернуть преобразованные данные
      let output = new CleanCSS(css_options).minify(code)
      if (output.errors.length) throw output.errors //при ошибке вернуть ошибку
      if (output.warnings.length) throw output.warnings //при предупреждении вернуть предупреждение

      return output.styles
    },
    //применить указанные опции к данным js и вернуть преобразованные данные
    js: function (code) {
      let output = UglifyJS.minify(code, js_options)

      if (output.error) throw output.error

      return output.code
    },
    //применить указанные опции к данным html и вернуть преобразованные данные
    html: function (code) {
      return HtmlMinifier.minify(code, html_options)
    }
  }
  //вернуть преобразованные данные если они есть, иначе вернуть не преобразованные
  return minify_fns[ext] !== undefined ? minify_fns[ext](code) : code
}

//принимает путь
async function minify_file (file_path) {
  let file_ext = path.extname(file_path), //получить расширение из пути к файлу
    file_name = path.basename(file_path, file_ext) //получить имя файла с расширением
  return new Promise(function (resolve, reject) {
    //если в имени файла присутствует .min(и все символы в нем приведены к одному регистру с помощью простого преобразования, предоставляемого стандартом Unicode)->разрешить промис на удачу
    if (file_name.match(/.min/iu)) {
      resolve()
      return
    }
    // если расширение файла не .css, не .js, и не .html->разрешить промис на удачу
    if (!(file_ext === '.css' || file_ext === '.js' || file_ext === '.html')) {
      resolve()
      return
    }
    //считать файл по указанному пути
    fs.readFile(file_path, 'utf8', function (err, data) {
      if (err) throw err

      let result = get_minified_code(data, file_ext.substring(1)) //получаем измененные данные и разширение без точки
      //записать результат по новому указанному пути->разрешить промис на удачу
      fs.writeFile(file_path, result, function (err) {
        if (err) throw err

        resolve()
      })
    })
  })
}

//удалить папку по заданному пути
function remove_by_path (path) {
  //если по заданному пути папка- удалить её рекурсивно
  if (fs.lstatSync(path).isDirectory()) {
    fs.rmdirSync(path, { recursive: true })
    //иначе удалить файл
  } else {
    fs.unlinkSync(path)
  }
}

module.exports = {
  archive_upload
}
