require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const morgan = require("morgan");
const port = process.env.PORT || 5000;
const app = express();

// use middleware
const corsOptions = {
  origin: ["http://localhost:5173"],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

// verify token middle ware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).send({ message: "unathorized access" });
  }
  jwt.verify(token, process.env.ACEESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "unauthorized access" });
    }
    req.user = decoded;
    next();
  });
};

// connect to mongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lfjkv.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
    // database collection
    const usersCollection = client.db("matrimony").collection("users");
    const biodataCollection = client.db("matrimony").collection("biodata");
    const favouritesBiodataCollection = client
      .db("matrimony")
      .collection("favouritesBiodata");

    // jwt related apis
    app.post("/jwt", async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACEESS_TOKEN_SECRET, {
        expiresIn: "15d",
      });
      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // if user logout jwt delete
    app.get("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          maxAge: 0,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // user related apis
    app.post("/users/:email", async (req, res) => {
      const email = req.params.email;
      console.log(email);
      const query = { email };
      const user = req.body;
      const isExists = await usersCollection.findOne(query);
      if (isExists) {
        return res.send({ message: "user allready exists" });
      }
      const result = await usersCollection.insertOne({
        ...user,
        role: "normal",
        timestamp: Date.now(),
      });
      res.send(result);
    });

    // get user role
    app.get("/users/role/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await usersCollection.findOne({ email });
      res.send({ role: result?.role });
    });

    // bidata related apis
    // post a biodata to db
    app.post("/biodata", verifyToken, async (req, res) => {
      const biodata = req.body;
      const lastId = await biodataCollection.countDocuments();
      const biodataId = lastId + 1;

      const result = await biodataCollection.insertOne({
        ...biodata,
        biodataId,
      });
      res.send(result);
    });

    // get biodata use email to db
    app.get("/biodata/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await biodataCollection.findOne({ email });
      res.send(result);
    });

    // get all biodata
    app.get("/biodata", async (req, res) => {
      const result = await biodataCollection.find().toArray();
      res.send(result);
    });

    // get specify biodata to db
    app.get("/biodata/details/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await biodataCollection.findOne(query);
      res.send(result);
    });

    // favourites biodata related apis
    // add to favourites post to db
    app.post("/favourites-biodata", verifyToken, async (req, res) => {
      const biodata = req.body;
      const result = await favouritesBiodataCollection.insertOne(biodata);
      res.send(result);
    });

    // get favourites biodata by email
    app.get("/favourites-biodata/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await favouritesBiodataCollection
        .find({ email })
        .toArray();
      res.send(result);
    });

    // delete a favourites biodata to db
    app.delete("/favourites-biodata/:id",verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await favouritesBiodataCollection.deleteOne(filter);
      res.send(result);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// server root route
app.get("/", (req, res) => {
  res.send("matrimoni web server runings.");
});

app.listen(port, () => {
  console.log(`Matrimoni server running on this port port ${port}`);
});
