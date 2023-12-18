require('dotenv').config()
const express = require('express');
const { MongoClient } = require('mongodb');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(express.static("public"));
app.use(express.urlencoded({extended: true}))

const url = `mongodb+srv://laurah:${process.env.DB_PASSWORD}@cluster0.vomr88x.mongodb.net/?retryWrites=true&w=majority`;
const dbName = 'autoGroup';
let db;

// placeholder need change to dynamic
const current_user_id = "65809c3de660c823d34232e9"

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
    try {
        const orders = await db.collection('sale_orders').aggregate([
            {
                $lookup: {
                    from: "vehicles",
                    localField: "vehicle_id",
                    foreignField: "_id",
                    as: "vehicle_info"
                }
            },
            {
                $lookup: {
                    from: "users",
                    localField: "sales_person_id",
                    foreignField: "_id",
                    as: "sales_person_info"
                }
            },
            {
                $unwind: "$vehicle_info"
            },
            {
                $unwind: "$sales_person_info"
            },
            {
                $project: {
                    order_id: "$_id",
                    make: "$vehicle_info.make",
                    model: "$vehicle_info.model",
                    year: "$vehicle_info.year_of_production",
                    mileage: "$vehicle_info.mileage",
                    sale_price: "$sale_price",
                    sale_date: "$sale_date",
                    profit: "$profit",
                    sales_person_name: { $concat: ["$sales_person_info.f_name", " ", "$sales_person_info.l_name"] },
                    store_branch: "$sales_person_info.branch"
                }
            }
        ]).toArray();

        res.render('sale_orders', { orders });
    } catch (error) {
        res.status(500).send(error.message);
    }
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

app.post('/buyin_report', async (req, res) => {
    try {
        // set default reconditioning cost
        const reconditioning_cost = 0

        // placeholder, hardcoded user and branch 
        const user_id = "65809c3de660c823d34232e9"
        const branch_location = "Lafayette, IN"

        // Extract form data
        const formData = req.body;
        const vehicleData = {
            VIN: formData.vin,
            make: formData.make,
            model: formData.model,
            year_of_production: formData.year,
            mileage: formData.mileage,
            fuel_type: formData.fuel_type,
            branch_location: branch_location,
            buyin_date: formData.buyin_date,
            buyin_price: formData.buyin_price,
            reconditioning_cost: reconditioning_cost,
        };

        // Insert vehicle data into the 'vehicles' collection
        const vehicleResult = await db.collection('vehicles').insertOne(vehicleData);
        const vehicleId = vehicleResult.insertedId;

        // Prepare buyin record data
        const buyinRecordData = {
            buyin_date: formData.buyin_date,
            vehicle_id: vehicleId,
            sales_person_id: user_id, 
            buyin_price: formData.buyin_price
        };

        // Insert buyin record into the 'buyin_records' collection
        await db.collection('buyin_records').insertOne(buyinRecordData);

        res.redirect('/inventory'); 
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.get('/profile', async (req, res) => {
    res.render('profile');
});
