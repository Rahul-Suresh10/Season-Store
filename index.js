import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import env from "dotenv";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth2";


const app = express();
const port = 3000;

env.config();

app.set('view engine', 'ejs');
app.set('views', './views'); 

app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended:true}));



app.use(session({
    secret: process.env.SESSION_SECRET,
    resave:false,
    saveUninitialized:true,
    cookie:{
        maxAge: 1000 * 60
    }
}));

app.use(passport.initialize());
app.use(passport.session());



let saltRounds = 10;

const db = new pg.Client({
    user: process.env.PG_USER,
    host: process.env.PG_HOST,
    database: process.env.PG_DATABASE,
    password: process.env.PG_PASSWORD,
    port: process.env.PG_PORT
});

db.connect();

let mainItems = [];
let cartItemsCount = 0;
async function getProducts()
{
    const result = await db.query("select * from products");
    mainItems = result.rows;
}
getProducts();




app.get("/", (req, res)=>{
    console.log(mainItems);

    res.render("pages/start.ejs");
});



app.get("/login", (req,res)=>{

    res.render("pages/login.ejs");
});

app.get("/register", (req,res)=>{
 
    res.render("pages/register.ejs");
});

app.get("/info", (req,res)=>{

    res.render("pages/info.ejs");
});


app.get("/home", async (req, res)=>{

   
    
    
    if(req.isAuthenticated())
    {
        const currentUser  = req.user.email;

 
        res.render("pages/home.ejs", {currentUser: currentUser, items:mainItems, cartItemsCount:cartItemsCount});
    }
    else
    {
        res.render("pages/start")
    }

});

let cartItems = [];


app.get("/cart", (req,res)=>{
    res.render("pages/cart.ejs", {cartItems:cartItems});
});

app.get("/logout", (req,res)=>{

    req.logout((err)=>{
        if(err){
            console.log(err);
        }
    
        res.redirect("/");
    });
});

app.get("/auth/google", passport.authenticate("google", {
    scope: ["profile", "email"]
}));

app.get("/auth/google/home", passport.authenticate("google", {
    successRedirect: "/home",
    failureRedirect: "/login"
}));


function findItem(index)
{
    
    let deletedItem;
    cartItems.forEach((item)=>{
        if(item.id == index)
        {
     
            deletedItem = item;
        }
    });
}

app.post("/add-to-cart", (req,res)=>{
    let itemId = req.body["addToCart-btn"];
    console.log(itemId);
    let addedItem = mainItems.find((item)=> item.product_id == itemId);
    console.log(addedItem);

    cartItems.push(addedItem);
    cartItemsCount = cartItems.length;
    res.redirect("/home");


});


app.post("/cart-item-action",(req,res)=>{

    if(req.body["Remove-btn"] == undefined)
    {
        //code for buying
       
        let deletedId = req.body["Buy-btn"];
        console.log(deletedId);
        findItem(deletedId);
        

    }
    if(req.body["Buy-btn"] == undefined)
    {
        //code for removing
        
        let deletedId = req.body["Remove-btn"];
        console.log(deletedId);
        cartItems = cartItems.filter((item)=> item.product_id != deletedId);
        cartItemsCount = cartItemsCount - 1;

        
        
    }
    

    
    res.redirect("/cart");
});

app.post("/filter-season", async (req,res)=>{

    let key;
    

    if(req.body["summer"] != undefined)
    {
        key = "summer";
    }
    else if(req.body["monsoon"] != undefined)
    {
        key = "monsoon";
    }
    else if(req.body["winter"] != undefined)
        {
            key = "winter"
        }
   else if(req.body["allseason"] != undefined)
    {
           key = "allseason"
     }

     if(key == "allseason")
     {
        getProducts();
        res.redirect("/home");
     }
     else
     {
        const result = await db.query("select * from products where season = $1", [key]);
        mainItems = result.rows;
        res.redirect("/home");

     }

});

app.post("/searchfrombar", async (req, res) => {
    try {
        let searchedItem = req.body["search-item"];
        let genderKey = '';
        console.log(searchedItem);
        console.log(typeof(searchedItem));
        

        if(searchedItem === "men" || searchedItem === "mens" || searchedItem === "boys" || searchedItem === "boy")
        {
           genderKey = 'M';
        }
        else if(searchedItem === "women" || searchedItem === "womens" || searchedItem === "girl" || searchedItem === "girls")
        {
            genderKey = 'F';
        }
        console.log(genderKey);
        let query;
        let value;

        if(genderKey == '')
        {
             query = "SELECT * FROM products WHERE season LIKE '%' || $1 || '%'";
             value = [searchedItem];
        }
        else
        {
            query = "SELECT * FROM products WHERE gender = $1";
            value = [genderKey];
        }

        const result = await db.query(query, value);
        mainItems = result.rows;

        // Assuming you want to pass mainItems to the home page
        res.redirect("/home");
   
    } catch (error) {
        console.error('Error executing query:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.post("/getBillingDetails",(req,res)=>{
    res.redirect("/info");
});


app.post("/login", passport.authenticate("local", {
    successRedirect: "/home",
    failureRedirect: "/login"
}));


app.post("/register", async (req,res)=>{
    const inputEmail = req.body["username"];
    const inputPassword = req.body["password"];
    const inputName = req.body["name"];

    try{
        const result = await db.query("select * from customers where email = $1", [inputEmail]);

        if(result.rows.length == 0)
        {
            bcrypt.hash(inputPassword, saltRounds, async (err, hash)=>{
                if(err)console.log(err);

                const users = await db.query("insert into customers (email, password,name) values ($1, $2, $3) returning *",[inputEmail, hash, inputName]);
                const user = users.rows[0];
                req.login(user,(err)=>{
                    res.redirect("/home");
                });

            });
        }
        else
        {
            res.send("User already registered");
            
        }

    }
    catch(err)
    {
       console.log(err);
    }
});



passport.use("local",new Strategy(async function verify(username, password, cb){

        try{
            const result = await db.query("select * from customers where email = $1", [username]);
           
    
            if(result.rows.length > 0)
            {
                const user = result.rows[0];

                const hashedPassword = user.password;

                
                bcrypt.compare(password, hashedPassword, (err, valid)=>{
                   
                    if(err){
                        return cb(err);
                    }
                    else
                    {
                        if(valid)
                            {
                                
                              
                                return cb(null, user);
                            }
                            else
                            {
                                return cb(null, false);
                            }
                    }
    
                    
                });            
                
            }
            else
            {
                return cb("user not found");
            }
        }
        catch(err)
        {
           cb(err);
        }

    }
));

passport.use("google", new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/home",
    userProfileURL:  "https://www.googleapis.com/oauth2/v3/userinfo"
},async (accessToken, refreshToken, profile, cb)=>{
  

    const inputEmail = profile.email;
    const inputName = profile.displayName;
    try{
        const result = await db.query("select * from customers where email = $1", [inputEmail]);
       

        if(result.rows.length > 0)
        {
            const user = result.rows[0];

            return cb(null, user);
            
        }
        else
        {
            const newUser = await db.query("insert into customers (email, password, name) values ($1, $2, $3) returning *", [inputEmail, "google", inputName]);
            const user = newUser.rows[0];

            return cb(null, user);
        }
    }
    catch(err)
    {
       cb(err);
    }

    
}));

passport.serializeUser((user,cb)=>{
    cb(null, user);
});

passport.deserializeUser((user,cb)=>{
    cb(null, user);
});


app.listen(port, ()=>{
    console.log(`running on port ${port}`);
});