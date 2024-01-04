require('dotenv').config();

const express = require('express');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

// Connect to Firebase
const admin = require('firebase-admin');
const serviceAccount = require('./firebase-adminsdk.json'); 

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const port = 3000;

app.set('view engine', 'ejs');
app.use(express.static("public"));
app.use(express.urlencoded({extended: true}))
app.use(express.json()); 
app.use(cookieParser());

// Middleware to check if the user is logged in
function isAuthenticated(req, res, next) {
    const token = req.cookies.session;
    if (!token) {
        return res.redirect('/login');
    }

    jwt.verify(token, process.env.JWT_SECRET_KEY, (err, decoded) => {
        if (err) {
            // Token is invalid or expired
            return res.redirect('/login');
        }
        next();
    });
}

// Global middleware for setting variables and checking authentication
app.use(async (req, res, next) => {
    // Set global variables for all views
    res.locals.firebaseApiKey = process.env.FIREBASE_API_KEY;

    // Verify JWT token in cookie
    if (req.cookies.session) {
        jwt.verify(req.cookies.session, process.env.JWT_SECRET_KEY, async (err, decoded) => {
            if (err) {
                res.locals.loggedIn = false;
                next();
            } else {
                res.locals.loggedIn = true;
                res.locals.userId = decoded.userId;

                try {
                    // Fetch user details from MongoDB
                    const user = await db.collection('users').findOne({ _id: res.locals.userId });
                    if (user) {
                        res.locals.full_name = user.f_name + ' ' + user.l_name;
                        res.locals.employee_branch = user.branch
                        res.locals.employee_type = user.employee_type
                    }
                } catch (dbError) {
                    console.error("Error fetching user from MongoDB:", dbError);
                }
                next();
            }
        });
    } else {
        res.locals.loggedIn = false;
        next();
    }
});


// Connect to MongoDB
const { MongoClient } = require('mongodb');
const url = `mongodb+srv://laurah:${process.env.DB_PASSWORD}@cluster0.vomr88x.mongodb.net/?retryWrites=true&w=majority`;
const dbName = 'autoGroup';
let db;

MongoClient.connect(url)
    .then(client => {
        db = client.db(dbName);
        app.listen(port, () => console.log(`Server running on port ${port}`));
    })
    .catch(err => {
        console.error("Failed to connect to MongoDB", err);
    });


app.get('/register', async (req, res) => {
    const branches = await db.collection('users').distinct('branch');
    const employee_types = ['Admin', 'Normal User']
    res.render('register', { status: '', branches, employee_types })
})

app.post('/register', async (req, res) => {
    const { email, password, f_name, l_name, phone, branch_dropdown, emp_type_dropdown, gender_dropdown, date_of_birth } = req.body;
  
    try {
        // Create user in Firebase Authentication
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
        });

        // Capitalize input and trim left and right spaces
        function capitalizeFirstWord(string) {
            return string.trim().replace(/^\w/, c => c.toUpperCase());
        }

        // Store additional user details in MongoDB
        await db.collection('users').insertOne({
            _id: userRecord.uid, // Use the Firebase UID as the MongoDB document ID
            email: email,
            f_name: capitalizeFirstWord(f_name),
            l_name: capitalizeFirstWord(l_name),
            phone: phone,
            branch: branch_dropdown,
            employee_type: emp_type_dropdown,
            gender: gender_dropdown,
            date_of_birth: new Date(date_of_birth),
        });
        res.redirect('/register/success?status=success');
    } catch (error) {
        console.error("Error in user registration:", error);
        if (error.code === 'auth/email-already-exists') {
            res.status(400).send("Email already exists");
        } else {
            res.status(500).send("Error registering user");
        }
    }
});

app.get('/register/success', async (req, res) => {
    const status = req.query.status;
    const branches = await db.collection('users').distinct('branch');
    const employee_types = ['Admin', 'Normal user'];
    res.render('register', { status: status, branches, employee_types });
});


app.get('/login', (req, res) => {
    res.render('login', { error: '' });
});

// Endpoint to verify Firebase token and create a JWT session token when login
app.post('/verifyToken', async (req, res) => {
    const { token } = req.body;

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;
        const userEmail = decodedToken.email;

        // Create a JWT for session management
        const sessionToken = jwt.sign({ userId: userId, email: userEmail }, process.env.JWT_SECRET_KEY, { expiresIn: '1h' });
        res.cookie('session', sessionToken, { httpOnly: true, secure: true }); 
        res.json({ success: true });
    } catch (error) {
        console.error('Error verifying Firebase token:', error);
        res.json({ success: false, error: 'Invalid token' });
    }
});

app.get('/logout', (req, res) => {
    res.clearCookie('session'); 
    res.redirect('/login'); 
});

    
app.get('/', isAuthenticated, async (req, res) => {
    try {
        // Function to build the match stage for weekly and monthly report based on date
        function buildMatchStage(dateThreshold) {
            let matchStage = { sale_date: { $gte: dateThreshold } };
            if (res.locals.employee_type !== "Admin") {
                matchStage["vehicle_info.branch_location"] = res.locals.employee_branch;
            }
            return matchStage;
        }

        const one_week_ago = new Date('2023-12-17');
        // note: for display purpose, hardcoded dates of weekly and monthly report
        // please uncomment the codes below to get real-time weekly and monthly report
        // const one_week_ago = new Date();
        // one_week_ago.setDate(one_week_ago.getDate() - 7);

        const weekly_matchStage = buildMatchStage(one_week_ago);

        const weekly_sale_stats = await db.collection('sale_orders').aggregate([
            {
                $lookup: {
                    from: "vehicles",
                    localField: "vehicle_id",
                    foreignField: "_id",
                    as: "vehicle_info"
                }
            },
            {
                $unwind: "$vehicle_info"
            },
            { $match: weekly_matchStage },
            { $group: {
                _id: null,
                total_orders: { $sum: 1 },
                total_amount: { $sum: "$sale_price" },
                total_profit: { $sum: "$profit" }
            }},
        ]).toArray();
        
        const weekly_sale = weekly_sale_stats[0] || { total_orders: 0, total_amount: 0, total_profit: 0 };


        const one_month_ago = new Date('2023-11-17');
        // uncomment for real-time reports
        // const one_week_ago = new Date();
        // one_week_ago.setDate(one_week_ago.getDate() - 7);

        const monthly_matchStage = buildMatchStage(one_month_ago);

        const monthly_sale_stats = await db.collection('sale_orders').aggregate([
            {
                $lookup: {
                    from: "vehicles",
                    localField: "vehicle_id",
                    foreignField: "_id",
                    as: "vehicle_info"
                }
            },
            {
                $unwind: "$vehicle_info"
            },
            { $match: monthly_matchStage },
            { $group: {
                _id: null,
                total_orders: { $sum: 1 },
                total_amount: { $sum: "$sale_price" },
                total_profit: { $sum: "$profit" }
            }},
        ]).toArray();
        
        const monthly_sale = monthly_sale_stats[0] || { total_orders: 0, total_amount: 0, total_profit: 0 };

        res.render('home', { weekly_sale, monthly_sale });
    } catch (error) {
        res.status(500).send('Error fetching sales data');
    }
});

app.get('/orders', isAuthenticated, async (req, res) => {
    try {
        const is_admin = res.locals.employee_type === 'Admin';

        // fetch filters data 
        const branches = await db.collection('users').distinct('branch');
        const sale_dates = await db.collection('sale_orders').distinct('sale_date');
        const makes = await db.collection('vehicles').distinct('make');
        const models = await db.collection('vehicles').distinct('model');
        let sales_person_fullnames;
        if (is_admin) {
            sales_person_fullnames = await db.collection('users').aggregate([
                {
                    $project: {
                        fullname: { $concat: ["$f_name", " ", "$l_name"] }
                    }
                }
            ]).toArray();
        } else {
            sales_person_fullnames = await db.collection('users').aggregate([
                {
                    $match: { branch: res.locals.employee_branch }
                },
                {
                    $project: {
                        fullname: { $concat: ["$f_name", " ", "$l_name"] }
                    }
                }
            ]).toArray();
        }

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

        // add user options to filterCritiria to filter table
        let filterCriteria = {};

        if (req.query.start_date) {
            filterCriteria['sale_date'] = { $gte: new Date(req.query.start_date) };
        }
        if (req.query.end_date) {
            filterCriteria['sale_date'] = { ...filterCriteria['sale_date'], $lte: new Date(req.query.end_date) };
        }

        if (req.query.employee_dropdown && req.query.employee_dropdown !== '') {
            const [f_name, ...l_name] = req.query.employee_dropdown.split(" ");
            filterCriteria['sales_person_info.f_name'] = f_name;
            filterCriteria['sales_person_info.l_name'] = l_name.join(" "); 
        }

        // additional filter based on user type
        if (!is_admin) {
            filterCriteria['sales_person_info.branch'] = res.locals.employee_branch;
        }
        if (is_admin && req.query.branch_dropdown && req.query.branch_dropdown !== '') {
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

        const sortCriteria = { order_date: -1, make: -1, model: -1, year: -1, mileage: -1, sale_price: -1, profit: -1} 


        // fetch data for table
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
                $match: filterCriteria
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
            },
            {
                $sort: sortCriteria
            }
        ]).toArray();

        res.render('sale_orders', { 
            orders,
            sale_dates,
            makes,
            models,
            years,
            mileages,
            branches,
            sales_person_fullnames,
            query: req.query,
            is_admin,
        });
    } catch (error) {
        res.status(500).send(error.message);
    }
});


app.get('/inventory', isAuthenticated, async (req, res) => {
    try {
        const is_admin = res.locals.employee_type === 'Admin';

        // fetch filters data 
        const branches = await db.collection('users').distinct('branch');
        const buyin_dates = await db.collection('buyin_records').distinct('buyin_date');
        const makes = await db.collection('vehicles').distinct('make');
        const models = await db.collection('vehicles').distinct('model');
        let sales_person_fullnames;
        if (is_admin) {
            sales_person_fullnames = await db.collection('users').aggregate([
                {
                    $project: {
                        fullname: { $concat: ["$f_name", " ", "$l_name"] }
                    }
                }
            ]).toArray();
        } else {
            sales_person_fullnames = await db.collection('users').aggregate([
                {
                    $match: { branch: res.locals.employee_branch }
                },
                {
                    $project: {
                        fullname: { $concat: ["$f_name", " ", "$l_name"] }
                    }
                }
            ]).toArray();
        }
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


        // add user options to filterCritiria to filter table
        let filterCriteria = {};

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

        // additional filter based on user type
        if (!is_admin) {
            filterCriteria['sales_person_info.branch'] = res.locals.employee_branch;
        }
        if (is_admin && req.query.branch_dropdown && req.query.branch_dropdown !== '') {
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


        // fetch data for table
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
            {
                $match: {
                    'vehicle_info.status': 'Active'
                }
            },
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
            query: req.query,
            is_admin,
        });
    } catch (error) {
        res.status(500).send(error.message);
    }
});


// reports pages
app.get('/reports/buyin_report', isAuthenticated, async (req, res) => {
    res.render('./reports/buyin_report', { status: '' });
});

app.post('/reports/buyin_report', isAuthenticated, async (req, res) => {
    try {
        // set default reconditioning cost
        const reconditioning_cost = 0
        const status = 'Active'

        const user_id = res.locals.userId
        const user_info = await db.collection('users').findOne({
            _id: user_id
        });
        const branch_location = user_info.branch

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
            branch_location: branch_location,
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
            sales_person_id: user_id,
            buyin_price: parseFloat(formData.buyin_price),
        };

        // Insert buyin record into the 'buyin_records' collection
        await db.collection('buyin_records').insertOne(buyinRecordData);

        res.redirect('/reports/buyin_report/success?status=success')
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.get('/reports/buyin_report/success', isAuthenticated, async (req, res) => {
    const status = req.query.status;
    res.render('./reports/buyin_report', { status: status });
});

app.get('/reports/sale_report', isAuthenticated, async (req, res) => {
    res.render('reports/sale_report', { status: '' });
});

app.post('/reports/sale_report', isAuthenticated, async (req, res) => {
    try {
        const user_id = res.locals.userId

        // Function to capitalize input and trim left and right spaces
        function capitalizeFirstWord(string) {
            return string.trim().replace(/^\w/, c => c.toUpperCase());
        }

        // Extract from user input
        const formData = req.body;
        const vehicleData = {
            VIN: capitalizeFirstWord(formData.vin),
            make: capitalizeFirstWord(formData.make),
            model: capitalizeFirstWord(formData.model),
            year_of_production: parseInt(formData.year),
            mileage: parseInt(formData.mileage),
            sale_date: new Date(formData.sale_date),
            sale_price: parseFloat(formData.sale_price)
        };

        // Query the database to check if the vehicle has been sold
        const sold_vehicle = await db.collection('vehicles').findOne({
            VIN: vehicleData.VIN,
            make: vehicleData.make,
            model: vehicleData.model,
            year_of_production: vehicleData.year_of_production,
            mileage: vehicleData.mileage,
            status: "Active" 
        });

        // if haven't sold yet
        if (sold_vehicle) {
            const sold_vehicle_id = sold_vehicle._id;
            const sold_vehicle_buyin_price = sold_vehicle.buyin_price;
            const sold_vehicle_reconditioning_cost = sold_vehicle.reconditioning_cost;
            const sold_vehicle_profit = vehicleData.sale_price - sold_vehicle_buyin_price - sold_vehicle_reconditioning_cost;

            // Update vehicle status
            await db.collection('vehicles').updateOne(
                { _id: sold_vehicle_id },
                { $set: { status: 'Sold' } }
            );

            // Insert new order data
            const new_order_data = {
                sale_price: vehicleData.sale_price,
                sales_person_id: user_id,
                vehicle_id: sold_vehicle_id,
                buyin_price: sold_vehicle_buyin_price,
                reconditioning_cost: sold_vehicle_reconditioning_cost,
                profit: sold_vehicle_profit,
                sale_date: vehicleData.sale_date,
            };
            await db.collection('sale_orders').insertOne(new_order_data); 

            res.redirect('/reports/sale_report/success?status=success');
        } else {
            res.status(404).send("Vehicle not found or already sold");
        }
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.get('/reports/sale_report/success', isAuthenticated, async (req, res) => {
    const status = req.query.status;
    res.render('./reports/sale_report', { status: status });
});


app.get('/reports/reconditioning_report', isAuthenticated, async (req, res) => {
    res.render('reports/reconditioning_report', { status: '' });
});

app.post('/reports/reconditioning_report', isAuthenticated, async (req, res) => {
    try {
        // Function to capitalize input and trim left and right spaces
        function capitalizeFirstWord(string) {
            return string.trim().replace(/^\w/, c => c.toUpperCase());
        }

        // Extract from user input
        const formData = req.body;
        const vehicleData = {
            VIN: capitalizeFirstWord(formData.vin),
            make: capitalizeFirstWord(formData.make),
            model: capitalizeFirstWord(formData.model),
            year_of_production: parseInt(formData.year),
            mileage: parseInt(formData.mileage),
            reconditioning_cost: parseFloat(formData.reconditioning_cost)
        };

        // Query the database to check if the vehicle is still active
        const vehicle = await db.collection('vehicles').findOne({
            VIN: vehicleData.VIN,
            make: vehicleData.make,
            model: vehicleData.model,
            year_of_production: vehicleData.year_of_production,
            mileage: vehicleData.mileage,
            status: "Active" 
        });

        if (vehicle) {
            const vehicle_id = vehicle._id;
            const reconditioning_cost = vehicleData.reconditioning_cost;

            // Update vehicle status
            await db.collection('vehicles').updateOne(
                { _id: vehicle_id },
                { $set: { reconditioning_cost: reconditioning_cost } }
            );

            res.redirect('/reports/reconditioning_report/success?status=success');
        } else {
            res.status(404).send("Vehicle not found or already sold");
        }
    } catch (error) {
        res.status(500).send(error.message);
    }
});

app.get('/reports/reconditioning_report/success', isAuthenticated, async (req, res) => {
    const status = req.query.status;
    res.render('./reports/reconditioning_report', { status: status });
});

app.get('/profile', isAuthenticated, async (req, res) => {
    const user_id = res.locals.userId

    // fetch user account information
    const user_info = await db.collection('users').findOne({
        _id: user_id
    });
    const f_name = user_info.f_name;
    const l_name = user_info.l_name;
    const email = user_info.email;
    const phone = user_info.phone;
    const branch = user_info.branch;
    const employee_type = user_info.employee_type;

    res.render('profile', {f_name, l_name, email, phone, branch, employee_type});
});

app.post('/profile', isAuthenticated, async (req, res) => {
    const user_id = res.locals.userId

    const userData = req.body
    const new_email = userData.email
    const new_phone = userData.phone

    // Update user info
    try {
        await db.collection('users').updateOne(
            { _id: user_id },
            { $set: { email: new_email, phone: new_phone } }
        );
        res.redirect('/profile');
    } catch (error) {
        console.error("Error updating user profile:", error);
        res.status(500).send("Error updating profile");
    }
});

app.get('/employees', isAuthenticated, async (req, res) => {
    const is_admin = res.locals.employee_type === 'Admin';
    const user_statuses = ["Active", "Pending", "Inactive"];
    const employees = await db.collection('users').find().toArray();

    // format the date for each employee
    const formattedEmployees = employees.map(employee => {
        if (employee.date_of_birth) {
            // Convert to Date object and format to YYYY-MM-DD
            employee.date_of_birth = new Date(employee.date_of_birth).toISOString().split('T')[0];
        }
        return employee;
    });

    res.render('employees', {is_admin, user_statuses, employees:formattedEmployees});
});

app.post('/employees', isAuthenticated, async (req, res) => {
    try {
        const { employeeId, newStatus } = req.body;

        await db.collection('users').updateOne(
            { _id: employeeId },
            { $set: { status: newStatus } }
        );

        res.redirect('/employees'); 
    } catch (error) {
        console.error("Error updating status:", error);
        res.status(500).send("Internal server error");
    }
});
