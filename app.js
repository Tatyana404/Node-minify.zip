const express = require('express')
const MinifyArchive = require('./app/minify_archive')

const app = express()
const port = process.env.PORT || 3000
const hostname = '127.0.0.1'

app.use(express.static(__dirname + '/views'))

app.post('/archive_upload', function (req, res) {
  MinifyArchive.archive_upload(req, res)
})

app.listen(port, hostname, function () {
  console.log(`Server running at http://${hostname}:${port}/`)
})
