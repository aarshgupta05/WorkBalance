const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const bodyParser = require('body-parser');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Secure session setup
app.set('trust proxy', 1);
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: false, // change to true if using HTTPS!
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 // 1 hour
  }
}));

// Middleware to parse JSON request bodies:
app.use(express.json()); // <-- This is crucial

// Set the view engine to EJS
app.set('view engine', 'ejs');

// Set the views directory to where your EJS files are located
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate-limiting middleware for login route
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit to 5 requests per window
  message: 'Too many login attempts from this IP, please try again after 15 minutes'
});

// Load users
const usersFilePath = path.join(__dirname, 'users.json');
let users = [];

if (fs.existsSync(usersFilePath)) {
  users = JSON.parse(fs.readFileSync(usersFilePath));
}

// Setup file upload directory with multer
const upload = multer({ dest: 'uploads/' });

// Redirect root to /login
app.get('/', (req, res) => {
  res.redirect('/login');
});

// Home route with login check
app.get('/home', (req, res) => {
  if (req.session.loggedIn) {
    res.sendFile(path.join(__dirname, 'public', 'static', 'home.html'));
  } else {
    res.redirect('/login');
  }
});

app.get('/settings', (req, res) => {
  if (req.session.loggedIn) {
    res.sendFile(path.join(__dirname, 'public', 'static', 'settings.html'));
  } else {
    res.redirect('/login');
  }
});

app.get('/portfolio', (req, res) => {
  if (req.session.loggedIn) {
    res.sendFile(path.join(__dirname, 'public', 'static', 'portfolio.html'));
  } else {
    res.redirect('/login');
  }
});

// GET route to render todo
app.get('/todo', (req, res) => {
  if (req.session.loggedIn) {
    fs.readFile(path.join(__dirname, 'data', 'todo.json'), 'utf8', (err, data) => {
      if (err) return res.status(500).send('Error reading todo.json');
      const items = JSON.parse(data);
      res.render('todo', { items });
    });
  } else {
    res.redirect('/login');
  }
});

app.post('/todo/save', (req, res) => {
  console.log('Received data:', req.body);  // <--- Debug line
  fs.writeFile(
    path.join(__dirname, 'data', 'todo.json'),
    JSON.stringify(req.body, null, 2),
    (err) => {
      if (err) return res.status(500).send('Error saving data');
      res.sendStatus(200);
    }
  );
});

app.get('/services', (req, res) => {
  if (req.session.loggedIn) {
    fs.readFile(path.join(__dirname, 'data', 'services.json'), 'utf8', (err, data) => {
      if (err) {
        console.error("Error reading services JSON:", err);
        return res.status(500).send('Internal Server Error');
      }
  
      const services = JSON.parse(data); // Parse the JSON data
      res.render('services', { services }); // Render EJS with the data
    });
  } else {
    res.redirect('/login');
  }
});

// Serve login page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'static', 'login.html'));
});

// Apply rate limiter to login route
app.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  const user = users.find(user => user.username === username);

  if (!user || !user.password) {
    return res.send('Invalid login. <a href="/login">Try again</a>');
  }

  const match = await bcrypt.compare(password, user.password);

  if (match) {
    req.session.loggedIn = true;
    req.session.username = username;
    res.redirect('/home');
  } else {
    res.send('Invalid password. <a href="/login">Try again</a>');
  }
});

// Serve signup page
app.get('/signup', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'static', 'signup.html'));
});

// Signup route
app.post('/signup', async (req, res) => {
  const { username, password } = req.body;

  const existingUser = users.find(user => user.username === username);
  if (existingUser) {
    return res.send('User already exists. <a href="/signup">Try again</a>');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  users.push({ username, password: hashedPassword });

  fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
  res.send('Signup successful! <a href="/login">Login here</a>');
});

// Serve project creation page
app.get('/create-project', (req, res) => {
  if (req.session.loggedIn) {
    res.sendFile(path.join(__dirname, 'public', 'static', 'create-project.html'));
  } else {
    res.redirect('/login');
  }
});

// Handle project submission
app.post('/submit-project', upload.single('image'), (req, res) => {
  if (req.session.loggedIn) {
    const { title, description } = req.body;
    const image = req.file; // The uploaded file

    if (!title || !description || !image) {
      return res.send('Please fill in all fields and upload an image.');
    }

    // Save project to a file (projects.json)
    const projectsFilePath = path.join(__dirname, 'projects.json');
    let projects = [];

    if (fs.existsSync(projectsFilePath)) {
      projects = JSON.parse(fs.readFileSync(projectsFilePath));
    }

    // Add new project to the list
    const newProject = {
      title,
      description,
      imagePath: image.path,
      createdAt: new Date().toISOString(),
    };

    projects.push(newProject);

    fs.writeFileSync(projectsFilePath, JSON.stringify(projects, null, 2));

    res.send('Project created successfully!');
  } else {
    res.redirect('/login');
  }
});

// Serve sidebar
app.get('/sidebar', (req, res) => {
  if (req.session.loggedIn) {
    res.sendFile(path.join(__dirname, 'public', 'static', 'sidebar.html'));
  } else {
    res.redirect('/login');
  }
});

// Serve test page
app.get('/test', (req, res) => {
  if (req.session.loggedIn) {
    res.sendFile(path.join(__dirname, 'public', 'static', 'test.html'));
  } else {
    res.redirect('/login');
  }
});

// Logout route
app.get('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.send('Error logging out');
    }
    res.redirect('/login');
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
