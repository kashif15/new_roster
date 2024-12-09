const express = require('express');
const multer = require('multer');
const XLSX = require('xlsx');
const sequelize = require('./config/database');
const Employee = require('./models/employee');
const Shift = require('./models/shift');
const { v4: uuidv4 } = require('uuid');  // For generating random UUID for employeeId
const app = express();
const { Op } = require('sequelize');
const bodyParser = require('body-parser'); // Corrected package name
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('./models/user'); // Assuming you have a User model
const SECRET_KEY = process.env.SECRET_KEY; // Use environment variables in production
const cookieParser = require('cookie-parser');
const methodOverride = require('method-override');



app.use(methodOverride('_method'));
app.use(cookieParser());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json()); // To parse JSON request body
app.use(express.urlencoded({ extended: true })); // To parse URL-encoded data
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ error: 'File upload error' });
    }
    if (err) {
        return res.status(500).json({ error: err.message });
    }
    next();
});




// const imageUpload = multer({
//     dest: 'uploads/',
//     fileFilter: (req, file, cb) => {
//         if (file.mimetype.startsWith('image/')) {
//             cb(null, true);  // Accept image files
//         } else {
//             cb(new Error('Not an image! Please upload an image.'), false);  // Reject non-image files
//         }
//     }
// });

// const excelUpload = multer({
//     dest: 'uploads/',
//     fileFilter: (req, file, cb) => {
//         if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.mimetype === 'application/vnd.ms-excel') {
//             cb(null, true);  // Accept Excel files
//         } else {
//             cb(new Error('Not an Excel file! Please upload a valid Excel file.'), false);  // Reject non-Excel files
//         }
//     }
// });

const upload = multer({
    dest: 'uploads/',
    fileFilter: (req, file, cb) => {
        if (file.fieldname === 'file') {
            // Excel file validation
            if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
                file.mimetype === 'application/vnd.ms-excel') {
                cb(null, true);
            } else {
                cb(null, false);
                return cb(new Error('Please upload a valid Excel file'));
            }
        } else if (file.fieldname === 'image') {
            // Image file validation
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(null, false);
                return cb(new Error('Please upload a valid image file'));
            }
        }
    }
});



// Sync the database
sequelize.sync({ alter: true })
    .then(() => console.log('Database synced'))
    .catch(err => console.error('Error syncing database:', err));

    const generateUniqueRandomId = async () => {
        let isUnique = false;
        let newId;
    
        while (!isUnique) {
            newId = Math.floor(100000 + Math.random() * 900000).toString(); // Generate 6-digit random ID
            const existingEmployee = await Employee.findOne({ where: { employeeId: newId } });
            if (!existingEmployee) {
                isUnique = true; // ID is unique
            }
        }
    
        return newId;
    };
    

function generateRandomEmail(employeeName) {
    const randomPart = Math.random().toString(36).substring(2, 8); // Random string of 6 chars
    return `${employeeName.toLowerCase().replace(/\s+/g, '')}.${randomPart}@example.com`;
}

function generateRandomImg() {
    const random = Math.floor(10 + Math.random() * 90);
    return `https://randomuser.me/api/portraits/men/${random}.jpg`;
}

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
    const token = req.cookies.token; // Retrieve token from cookie

    if (!token) {
        return res.redirect('/login');
        // return res.status(403).send('A valid token is required for authentication');
    }

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = decoded; // Attach user data to request object
        next();
    } catch (err) {
        return res.redirect('/login');
        // return res.status(401).send('Invalid token');
    }
};


// Middleware to check if user is an admin
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return res.status(403).send('Admin privileges required');
    }
};



// List of valid shift codes
const VALID_SHIFT_CODES = ['M', 'A', 'N','G'];

app.get('/', async (req, res) => {
    const employees = []; // Initially, pass an empty array
    res.render('index', { employees });
});

// Route to render the team.ejs page
app.get('/team', async (req, res) => {
    try {
        const employees = await Employee.findAll({
            attributes: ['employeeId','employeeName', 'image']  // Fetching employee name and image
        });

        res.render('team', { employees });  // Passing the employee data to the team.ejs file
    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).send('Error fetching employee details');
    }
});

// Route to display employee profile
app.get('/profile/:employeeId', async (req, res) => {
    const { employeeId } = req.params;

    try {
        // Fetch the employee details
        const employee = await Employee.findByPk(employeeId);

        // Fetch all shifts for this employee
        const shifts = await Shift.findAll({
            where: { employeeId: employeeId }
        });

        if (!employee) {
            return res.status(404).send('Employee not found');
        }

        // Combine shifts from all months into one object
        let combinedShifts = {};
        shifts.forEach(shiftRecord => {
            const shiftData = shiftRecord.shifts;
            Object.keys(shiftData).forEach(date => {
                combinedShifts[date] = shiftData[date];
            });
        });

        const stringifiedShifts = JSON.stringify(combinedShifts);

        // Pass the employee and combined shift data to the template
        res.render('profile', { employee, shifts: stringifiedShifts });
    } catch (error) {
        console.error('Error fetching profile:', error);
        res.status(500).send('Internal server error');
    }
});

app.get("/login", async (req, res) => {
    
    res.render('login', { error: null });
});


// POST route to upload Excel file
app.post('/upload', verifyToken, isAdmin, upload.single('file'), async (req, res) => {
    const { month, year } = req.body;

    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a valid Excel file' });
        }

        const existingShifts = await Shift.findAll({ where: { month, year } });

        if (existingShifts.length > 0) {
            // If data exists, delete it
            await Shift.destroy({ where: { month, year } });
            console.log(`Deleted existing shifts for ${month}/${year}`);
        }

        const workbook = XLSX.readFile(req.file.path);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

        // Extract headers and determine the last valid column index
        const headers = rows[0];
        const lastDateColumnIndex = headers.findIndex(header => {
            if (typeof header === 'string') {
                return header.trim().toLowerCase() === 'comp-off';
            }
            return false;
        }) - 1; // Subtract 1 to exclude the "Comp-off" column

        console.log('Headers:', headers);
        console.log('Last Date Column Index:', lastDateColumnIndex);

        const employeeShiftsMap = {}; // Store aggregated shifts for each employee

        // Process rows starting from the second row (skipping header row)
        for (let i = 2; i < rows.length; i++) {
            const row = rows[i];
            const employeeName = row[0]?.trim(); // Employee name is in the first column
            if (!employeeName) continue; // Skip invalid rows

            // Validate if the row has any valid shift codes
            let hasValidShift = false;
            for (let j = 1; j <= lastDateColumnIndex; j++) {
                const shiftType = typeof row[j] === 'string' ? row[j].trim() : null;
                if (VALID_SHIFT_CODES.includes(shiftType)) {
                    hasValidShift = true;
                    break; // Stop checking once a valid shift code is found
                }
            }

            if (!hasValidShift) {
                console.log(`Skipping employee ${employeeName} due to no valid shift codes`);
                continue; // Skip this employee if no valid shift code
            }

            // Check if employee exists, else create a new one
            let employee = await Employee.findOne({ where: { employeeName } });

            if (!employee) {
                const employeeId = await generateUniqueRandomId(); // Ensure unique ID
                const email = generateRandomEmail(employeeName);
                const image = generateRandomImg();
                employee = await Employee.create({ employeeId, employeeName, email, image });
                console.log(`Employee ${employeeName} created with ID ${employeeId} and email ${email}`);
            }


            // Prepare a JSON object to store the shifts
            const shiftsForEmployee = employeeShiftsMap[employee.employeeId] || {};

            // Process shifts for the employee and store in the JSON object
            for (let j = 1; j <= lastDateColumnIndex; j++) {
                const shiftType = typeof row[j] === 'string' ? row[j].trim() : null;
                const dateStr = headers[j]; // Get date from the first row
                const date = XLSX.SSF.parse_date_code(dateStr);
                const formattedDate = `${date.y}-${date.m}-${date.d}`; // Format date as YYYY-MM-DD

                shiftsForEmployee[formattedDate] = shiftType; // Store shift type for the date
            }

            // Update the employeeShiftsMap with the aggregated shifts
            employeeShiftsMap[employee.employeeId] = shiftsForEmployee;
        }

        // Save aggregated shifts into the database
        for (const employeeId in employeeShiftsMap) {
            await Shift.create({
                employeeId,
                shifts: employeeShiftsMap[employeeId],
                month,
                year
            });
        }

        res.redirect('/');
    } catch (err) {
        console.error('Error processing file:', err);
        res.status(500).json({ error: err.message || 'Error processing file' });
    }
});


// GET route to display all employee details
app.get('/employees', async (req, res) => {
    try {
        const employees = await Employee.findAll({
            attributes: ['employeeId', 'employeeName', 'email', 'image']  // Add image attribute here
        });
        res.json(employees);
    } catch (err) {
        console.error('Error fetching employees:', err);
        res.status(500).send('Error fetching employee details');
    }
});



app.get('/shifts', async (req, res) => {
    try {
        const { month, year } = req.query;

        if (!month || !year) {
            return res.status(400).json({ error: 'Please provide both month and year' });
        }

        const shiftDetails = await Shift.findAll({
            where: { month, year },
            include: [
                {
                    model: Employee,
                    attributes: ['employeeName', 'email', 'employeeId', 'image']
                }
            ]
        });

        if (shiftDetails.length === 0) {
            return res.status(404).json({ message: 'No shift details found for the provided month and year' });
        }

        res.json(shiftDetails);
    } catch (error) {
        console.error('Error fetching shift details:', error);
        res.status(500).json({ error: 'An error occurred while fetching shift details' });
    }
});


// Get employee shift details by specific date
app.get('/onshift', async (req, res) => {
    try {
        const { shiftDate } = req.query;

        // Validate the date input
        if (!shiftDate || isNaN(new Date(shiftDate))) {
            return res.status(400).json({ error: 'Please provide a valid shiftDate in YYYY-MM-DD format' });
        }

        // Fetch shift details where the shiftDate exists in the shifts JSON object
        const shiftDetails = await Shift.findAll({
            where: {
                [Op.or]: [
                    { shifts: { [Op.contains]: { [shiftDate]: "A" } } }, // A shift (Afternoon)
                    { shifts: { [Op.contains]: { [shiftDate]: "M" } } }, // M shift (Morning)
                    { shifts: { [Op.contains]: { [shiftDate]: "N" } } },  // N shift (Night)
                    { shifts: { [Op.contains]: { [shiftDate]: "G" } } }
                ]
            },
            include: [
                {
                    model: Employee,
                    attributes: ['employeeName', 'email', 'employeeId', 'image']
                }
            ]
        });

        // Check if any shift details were found
        if (shiftDetails.length === 0) {
            return res.status(404).json({ message: 'No shift details found for the provided date' });
        }

        // Map and format the response
        const formattedShiftDetails = shiftDetails.map(shiftDetail => {
            const employee = shiftDetail.Employee;
            let shiftType = '';

            // Determine the shift type (Morning, Afternoon, Night)
            if (shiftDetail.shifts[shiftDate] === 'M') {
                shiftType = 'Morning';
            } else if (shiftDetail.shifts[shiftDate] === 'A') {
                shiftType = 'Afternoon';
            } else if (shiftDetail.shifts[shiftDate] === 'N') {
                shiftType = 'Night';
            } else if (shiftDetail.shifts[shiftDate] === 'G') {
                shiftType = 'General';
            }

            // Return formatted data
            return {
                name: employee.employeeName,
                email: employee.email,
                employeeId: employee.employeeId,
                image: employee.image,
                shift: shiftType
            };
        });

        // Send the formatted shift details to the frontend
        res.json(formattedShiftDetails);
    } catch (error) {
        console.error('Error fetching shift details by date:', error);
        res.status(500).json({ error: 'An error occurred while fetching shift details' });
    }
});



// Get employee shift details by employeeId (or employeeName), month, and year
app.get('/employeeinfo', async (req, res) => {
    try {
        const { employeeName, month, year } = req.query;

        if (!employeeName || !month || !year) {
            return res.status(400).json({ error: 'Please provide employeeName, month, and year' });
        }

        const employeeShifts = await Shift.findAll({
            where: { month, year },
            include: [
                {
                    model: Employee,
                    where: { employeeName } // Consider using Op.iLike for case-insensitivity
                }
            ]
        });

        if (employeeShifts.length === 0) {
            return res.status(404).json({ message: 'No shift data found for the specified employee, month, and year' });
        }

        res.json(employeeShifts);
    } catch (err) {
        console.error('Error fetching employee shift details:', err);
        res.status(500).json({ error: 'An error occurred while fetching employee shift details' });
    }
});

// POST route to upload employee image by name
app.post('/upload-image', upload.single('image'), async (req, res) => {
    const { employeeName } = req.body;

    try {

        // Validate if an image is uploaded
        if (!req.file) {
            return res.status(400).json({ error: 'Please upload a valid image file' });
        }

        // Validate if employeeName is provided
        if (!employeeName) {
            return res.status(400).json({ error: 'Please provide an employee name' });
        }

        // Find the employee by name
        const employee = await Employee.findOne({ where: { employeeName } });

        // Check if the employee exists
        if (!employee) {
            return res.status(404).json({ error: `Employee with name ${employeeName} not found` });
        }

        // Update the employee's image with the path of the uploaded file
        const imagePath = `/uploads/${req.file.filename}`;  // Store relative path to the file
        employee.image = imagePath;  // Save the new image path to the employee record
        await employee.save();  // Save changes to the database

        // Send success response with updated employee details
        res.json({ message: 'Image uploaded successfully', employee });
    } catch (err) {
        console.error('Error uploading image:', err);
        res.status(500).json({ error: err.message || 'Error uploading image' });
    }
});

// PUT route to update employee details by employeeName, including image upload
app.put('/update',  verifyToken, isAdmin, upload.single('image'), async (req, res) => {
    const { employeeName, employeeId, email } = req.body;

    try {
        // Validate input
        if (!employeeName) {
            return res.status(400).json({ 
                error: 'Please provide an employee name',
                redirect: false
            });
        }

        // Validate file upload
        if (!req.file) {
            return res.status(400).json({ 
                error: 'Please upload a valid image file',
                redirect: false
            });
        }

        // Find the employee by name
        const employee = await Employee.findOne({ where: { employeeName } });

        // Check if the employee exists
        if (!employee) {
            return res.status(404).json({ 
                error: `Employee with name ${employeeName} not found`,
                redirect: false
            });
        }

        // Update the employee details
        if (employeeId) {
            employee.employeeId = employeeId;
        }
        if (email) {
            employee.email = email;
        }

        // Update image path
        const imagePath = `/uploads/${req.file.filename}`;
        employee.image = imagePath;

        // Save the updated employee details
        await employee.save();

        // Return success response
        return res.json({
            success: true,
            redirect: '/',
            message: 'Profile updated successfully'
        });

    } catch (err) {
        console.error('Error updating employee:', err);
        return res.status(500).json({ 
            error: 'An error occurred while updating employee details',
            redirect: false
        });
    }
});

// Login route
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const user = await User.findOne({ where: { username } });

        if (!user) {
            return res.render('login', { error: 'Invalid username or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.render('login', { error: 'Invalid username or password' });
        }

        const token = jwt.sign({ id: user.id, role: user.role }, SECRET_KEY, { expiresIn: '1h' });
        res.cookie('token', token, { httpOnly: true, secure: true, maxAge: 3600000 });

        res.redirect('/');
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).render('login', { error: 'Internal server error' });
    }
});





// Start the server
app.listen(3000, () => {
    console.log('Server running on http://localhost:3000');
});
