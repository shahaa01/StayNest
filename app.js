const express = require('express');
const mongoose = require('mongoose');
const PORT = 8080;
const app = express();
const path = require('path');
const methodOverride = require('method-override');
const engine = require('ejs-mate');
const listingsRoutes = require('./routes/listing');
const reviewRoutes = require('./routes/reviews');
const authRoutes = require('./routes/authRoutes');
const session = require('express-session');
const flash = require('connect-flash');
const {localStore} = require('./middlewares');
const passport = require('passport');
const LocalStrategy = require('passport-local');
const User = require('./models/user');
const Listing = require('./models/listing');
const Review = require('./models/review');
const MongoStore = require('connect-mongo');
const homeRoute = require('./routes/homeRoutes');

const isProduction = process.env.NODE_ENV === 'production';

require('dotenv').config(); //to configure environmental variables in process.env

const dbUrl = process.env.MONGO_ATLAS_URL; //mongodb atlas url 

//Lets set ejs and required middlewares here
app.set("view engine", 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));
app.use(express.urlencoded({extended: true})); //to parse form data
app.use(express.json()); //for JSON data
app.engine('ejs', engine); //to set ejs as ejs-mate

const store = MongoStore.create({
  mongoUrl: dbUrl,
  crypto: {
    secret: process.env.SECRET_CODE
  },
  touchAfter: 24 * 60
});

if(isProduction) {
  app.set('trust proxy', 1); // 👈 This tells Express to trust the Render proxy
}

app.use(session({ //setting session with needed session options
  store,
  secret: process.env.SECRET_CODE,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: (7 * 24 * 60 * 60 * 1000), //7 days
    secure: isProduction 
  }
}))
app.use(flash()); //to use connect-flash 
app.use(passport.initialize()); //initialization passport
app.use(passport.session()); //enables session based authentication
app.use(localStore); //using middleware (custom) to store success and failure messages and other important things in locals
passport.use(new LocalStrategy(User.authenticate())); //for passport to use local strategy
passport.serializeUser(User.serializeUser()); //for passport to store session ID in the server
passport.deserializeUser(User.deserializeUser()); //for passport to retrieve the user based on session ID and attach the info to req.user which can be accessed from any routes;

//connecting to the database here
main().then(() => console.log('Database Connected Successfully🚀')).catch(err => console.log(err));
//sync indexes properly according to the schema 

async function main() {
  await mongoose.connect(dbUrl);
  User.syncIndexes();
  Listing.syncIndexes();
  Review.syncIndexes();
}

//routes for auth
app.use('/auth', authRoutes);

//routes here for listings
app.use('/listing', listingsRoutes);

//routes here for reviews
app.use('/reviews/:id', reviewRoutes);

app.use('/', homeRoute);

//this is error handling middleware which only handles sync errors - for async we used asyncWrap Functions
app.use((err, req, res, next) => {
  let {status = 500, message = "Something went wrong!"} = err;
  
  // Special case: prevent redirect loops for auth errors
  if (req.originalUrl.startsWith('/auth') && err.redirectLink === '/auth/login') {
    return res.status(status).render('pages/loginForm', { error: message });
  }
  if(req.flash) {
    req.flash('failure', message);
    res.redirect(err.redirectLink || '/listing');
  }

});

app.use((req, res) => {
  res.status(404).render('pages/error', {errStatus: 404, errMessage: "Invalid URL! Page Not Found", link: "/listing"});
});

app.listen(PORT, () => {
  console.log(`Server is listening at http://localhost:${PORT}`);
});
