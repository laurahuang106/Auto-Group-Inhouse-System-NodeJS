const express = require('express');

const app = express();
const port = 3000;

app.set('view engine', 'ejs')
app.use(express.static("public"))

const url = 'MONGODB_ATLAS_CONNECTION_STRING';
const dbName = 'DATABASE_NAME';


app.get('/', async (req, res) => {
    res.render('index')
});

app.get('/orders', async (req, res) => {
    res.render('sale_orders')
});

app.listen(port)
