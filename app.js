require('dotenv').config()
const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(express.static("public"));

const url = `mongodb+srv://laurah:${process.env.DB_PASSWORD}@cluster0.vomr88x.mongodb.net/?retryWrites=true&w=majority`;
const dbName = 'autoGroup';
let db;

// Connect to MongoDB
MongoClient.connect(url)
    .then(client => {
        db = client.db(dbName);
        app.listen(port, () => console.log(`Server running on port ${port}`));
    })
    .catch(err => {
        console.error("Failed to connect to MongoDB", err);
    });

app.get('/', async (req, res) => {
    res.render('index');
});

app.get('/orders', async (req, res) => {
    res.render('sale_orders');
});

app.get('/inventory', async (req, res) => {
    try {
        const vehicles = await db.collection('vehicles').find({}).toArray();
        res.render('inventory', { vehicles: vehicles }); 
    } catch (error) {
        res.status(500).send(error);
    }
});

app.get('/buyin_report', async (req, res) => {
    res.render('buyin_report');
});

app.get('/profile', async (req, res) => {
    res.render('profile');
});
