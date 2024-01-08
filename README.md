# AutoGroup Sales Management System


# Table of contents
1. [Description](#description)
2. [Installation](#installation)
3. [Usage](#usage)
4. [Features](#features)


## Description
```
AutoGroup Sales Management System is a web application designed to manage vehicle sales, inventory, and employee data for a car dealership. It integrates with Firebase for authentication and MongoDB for data storage, providing features like user registration, sales reports, inventory management, and employee management.

```
## Installation
* Clone the repository: git clone [repository-url]
    
* Navigate to the project directory: cd [project-directory]

* Install dependencies: npm install

* Set up your environment variables
  
* Rename .env.example to .env: Fill in your Firebase and MongoDB credentials

* Start the application: npm start


## Usage
* Visit http://localhost:3000 in your web browser to access the application.
* Use the /register route to create new user accounts.
* Log in using registered credentials at the /login route.
* Access different functionalities based on user roles.


## Technologies
* Node.js
* Express.js
* MongoDB
* Firebase Authentication
* EJS (Embedded JavaScript templates)
* JWT (JSON Web Tokens) for session management
* Dotenv for environment variable management


## Features
* User authentication with Firebase
* Role-based access control with Admin and Normal User roles
* Registration of new users with pending status until approved by an Admin
* Profile management for users
* Sales orders and inventory management
* Detailed reports for buy-ins, sales, and reconditioning
* Employee management with the ability to update statuses
