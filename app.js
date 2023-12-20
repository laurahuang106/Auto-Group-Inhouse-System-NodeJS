require('dotenv').config()
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(express.static("public"));
app.use(express.urlencoded({extended: true}))

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
                    sale_date: {"$dateToString": {format: "%Y-%m-%d", date: "$sale_date"}},
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
        let filterCriteria = {};

        // fetch filters data 
        const branches = await db.collection('users').distinct('branch');
        const buyin_dates = await db.collection('buyin_records').distinct('buyin_date');
        const makes = await db.collection('vehicles').distinct('make');
        const models = await db.collection('vehicles').distinct('model');
        const sales_person_fullnames = await db.collection('users').aggregate([
            {
                $project: {
                    fullname: { $concat: ["$f_name", " ", "$l_name"] }
                }
            }
        ]).toArray();

        /// find the minimum and maximum year of production
        const yearRangeResult = await db.collection('vehicles').aggregate([
            {
                $group: {
                    _id: null,
                    min_year: { $min: "$year_of_production" },
                    max_year: { $max: "$year_of_production" }
                }
            }
        ]).toArray();
        const minYear = yearRangeResult[0] ? yearRangeResult[0].min_year : null;
        const maxYear = yearRangeResult[0] ? yearRangeResult[0].max_year : null;
        const year_gap = 1; 
        const years = [];
        for (let i = minYear; i <= maxYear; i += year_gap) {
            years.push(i);
        }

        // hardcoded max mileage of all cars
        const max_mileage = 100000
        const mileage_gap = 10000; 
        const mileages = [];
        for (let i = 0; i <= max_mileage; i += mileage_gap) {
            mileages.push(i);
        }

        // add filterCrititeria based on user's choice
        if (req.query.start_date) {
            filterCriteria['buyin_date'] = { $gte: new Date(req.query.start_date) };
        }
        if (req.query.end_date) {
            filterCriteria['buyin_date'] = { ...filterCriteria['buyin_date'], $lte: new Date(req.query.end_date) };
        }

        if (req.query.employee_dropdown && req.query.employee_dropdown !== '') {
            const [f_name, ...l_name] = req.query.employee_dropdown.split(" ");
            filterCriteria['sales_person_info.f_name'] = f_name;
            filterCriteria['sales_person_info.l_name'] = l_name.join(" "); 
        }

        if (req.query.branch_dropdown && req.query.branch_dropdown !== '') {
            filterCriteria['sales_person_info.branch'] = req.query.branch_dropdown;
        }

        if (req.query.make_dropdown && req.query.make_dropdown !== '') {
            filterCriteria['vehicle_info.make'] = req.query.make_dropdown;
        }

        if (req.query.model_dropdown && req.query.model_dropdown !== '') {
            filterCriteria['vehicle_info.model'] = req.query.model_dropdown;
        }

        if (req.query.min_year_dropdown && req.query.min_year_dropdown !== '') {
            filterCriteria['vehicle_info.year_of_production'] = { $gte: parseInt(req.query.min_year_dropdown) };
        }
        if (req.query.max_year_dropdown && req.query.max_year_dropdown !== '') {
            filterCriteria['vehicle_info.year_of_production'] = { $lte: parseInt(req.query.max_year_dropdown) };
        }

        if (req.query.min_mile_dropdown && req.query.min_mile_dropdown !== '') {
            filterCriteria['vehicle_info.mileage'] = { $gte: parseInt(req.query.min_mile_dropdown) };
        }
        if (req.query.max_mile_dropdown && req.query.max_mile_dropdown !== '') {
            filterCriteria['vehicle_info.mileage'] = { $lte: parseInt(req.query.max_mile_dropdown) };
        }

        const sortCriteria = { buyin_date: -1, VIN: -1, make: -1, model: -1, year: -1, mileage: -1, buyin_price: -1} 

        const records = await db.collection('buyin_records').aggregate([
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
                $match: filterCriteria
            },
            // {
            //     $match: {
            //         'vehicle_info.status': 'Active'
            //     }
            // },
            {
                $project: {
                    VIN: "$vehicle_info.VIN",
                    make: "$vehicle_info.make",
                    model: "$vehicle_info.model",
                    year: "$vehicle_info.year_of_production",
                    mileage: "$vehicle_info.mileage",
                    buyin_price: "$buyin_price",
                    buyin_date: {"$dateToString": {format: "%Y-%m-%d", date: "$buyin_date"}},
                    sales_person_fullname: { $concat: ["$sales_person_info.f_name", " ", "$sales_person_info.l_name"] },
                    store_branch: "$sales_person_info.branch"
                }
            },
            {
                $sort: sortCriteria
            }
        ]).toArray();
        
        res.render('inventory', { 
            records, 
            buyin_dates,
            makes,
            models,
            years,
            mileages,
            branches,
            sales_person_fullnames,
        });
    } catch (error) {
        res.status(500).send(error.message);
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
        const user_id = "65822220bdd23af2f423260f"
        const branch_location = "Champaign, IL"
        const status = 'Active'

        // capitalize input and trim left and right spaces
        function capitalizeFirstWord(string) {
            return string.trim().replace(/^\w/, c => c.toUpperCase());
        }

        // Extract form data
        const formData = req.body;
        const vehicleData = {
            VIN: capitalizeFirstWord(formData.vin),
            make: capitalizeFirstWord(formData.make),
            model: capitalizeFirstWord(formData.model),
            year_of_production: parseInt(formData.year),
            mileage: parseInt(formData.mileage),
            fuel_type: capitalizeFirstWord(formData.fuel_type),
            branch_location: capitalizeFirstWord(branch_location),
            buyin_date: new Date(formData.buyin_date),
            buyin_price: parseFloat(formData.buyin_price),
            reconditioning_cost: parseFloat(reconditioning_cost),
            status: status
        };

        // Insert vehicle data into the 'vehicles' collection
        const vehicleResult = await db.collection('vehicles').insertOne(vehicleData);
        const vehicleId = vehicleResult.insertedId;

        // Prepare buyin record data
        const buyinRecordData = {
            buyin_date: new Date(formData.buyin_date),
            vehicle_id: vehicleId,
            sales_person_id: new ObjectId(user_id), 
            buyin_price: parseFloat(formData.buyin_price)
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
