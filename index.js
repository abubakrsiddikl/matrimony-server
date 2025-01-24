require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const morgan = require("morgan");
const port = process.env.PORT || 5000;
const app = express();
const stripe = require("stripe")(process.env.PAYMENT_KEY);

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
    const paymentsCollection = client.db("matrimony").collection("payments");
    const favouritesBiodataCollection = client
      .db("matrimony")
      .collection("favouritesBiodata");
    const successStoryCollection = client
      .db("matrimony")
      .collection("successStory");

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

    // verifyAdmin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.user?.email;
      const query = { email };
      const result = await usersCollection.findOne(query);
      if (!result || result?.role !== "admin") {
        return res
          .status(403)
          .send({ message: "Forbidden Accecss Admin only access" });
      }
      next();
    };

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

    // update biodata use email to db
    app.put("/biodata/update/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const filter = { email: email };
      const updateDoc = {
        $set: req.body,
      };
      const result = await biodataCollection.updateOne(filter, updateDoc);
      res.send(result);
    });

    // get all biodata
    app.get("/biodata", async (req, res) => {
      const { limit, age, biodataType, permanentDivision } = req.query;
      const filter = { isPremium: "premium" };
      const query = {};
      if (age) query.age = parseInt(age);
      if (biodataType) query.biodataType = biodataType;
      if (permanentDivision) query.permanentDivision = permanentDivision;
      const finalQuery = { ...query };
      const result = limit
        ? await biodataCollection.find(filter).limit(Number(limit)).toArray()
        : await biodataCollection.find(finalQuery).toArray();

      res.send(result);
    });

    // get specify biodata to db
    app.get("/biodata/details/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await biodataCollection.findOne(query);
      res.send(result);
    });

    // sent to requset admin to biodata premium
    app.patch(
      "/biodata-premium/request/:email",
      verifyToken,
      async (req, res) => {
        const email = req.params.email;
        // console.log(email);
        const options = { upsert: true };
        const updateDoc = {
          $set: {
            isPremium: "requested",
            status: "Requested",
          },
        };
        const result = await biodataCollection.updateOne(
          { email },
          updateDoc,
          options
        );
        res.send(result);
      }
    );

    // success stroy related apis
    // saved a story to db
    app.post("/success-story", verifyToken, async (req, res) => {
      const story = req.body;
      const result = await successStoryCollection.insertOne(story);
      res.send(result);
    });

    // get a story to db
    app.get("/success-story", async (req, res) => {
      const result = await successStoryCollection.find().sort({marrigeDate: -1}).toArray();
      res.send(result);
    });

    // admin related apis
    // get  request to he/her biodata premium
    app.get(
      "/biodata-premium/request",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const query = {
          $or: [{ isPremium: "premium" }, { isPremium: "requested" }],
        };
        const filter = await biodataCollection.find(query).toArray();
        res.send(filter);
      }
    );

    // approved premium
    app.patch(
      "/biodata-premium/approved/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        const { id } = req.body;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            isPremium: "premium",
            status: "Verified",
          },
        };

        const result = await biodataCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // GET contact req info to db by admin
    app.get("/contact-request", verifyToken, verifyAdmin, async (req, res) => {
      const result = await paymentsCollection.find().toArray();
      res.send(result);
    });

    // update status for contact request
    app.patch(
      "/approved-contact/request",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { email, biodataId } = req.body;
        const query = {
          email: email,
          biodataId: biodataId,
        };
        const filter = await paymentsCollection.findOne(query);
        console.log(filter);
        const updateDoc = {
          $set: { status: "Approved" },
        };
        const result = await paymentsCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // get all users
    app.get("/users/:email", verifyToken, verifyAdmin, async (req, res) => {
      const email = req.params.email;
      const { searchParams } = req.query;
      console.log(searchParams);
      const query = { email: { $ne: email } };

      if (searchParams) {
        query.name = { $regex: searchParams, $options: "i" };
      }
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    // update user role admin
    app.patch(
      "/user/role/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { role: "admin" },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

    // update user role premium
    app.patch(
      "/user/role/premium/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: { role: "premium" },
        };
        const result = await usersCollection.updateOne(filter, updateDoc);
        res.send(result);
      }
    );

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
    app.delete("/favourites-biodata/:id", verifyToken, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const result = await favouritesBiodataCollection.deleteOne(filter);
      res.send(result);
    });

    // mycontactRequest apis
    app.get("/myContact-request/:email", verifyToken, async (req, res) => {
      const email = req.params.email;
      const result = await paymentsCollection
        .aggregate([
          {
            $match: {
              email: email,
            },
          },
          { $unwind: "$biodataId" },
          {
            $lookup: {
              from: "biodata",
              localField: "biodataId",
              foreignField: "biodataId",
              as: "biodata",
            },
          },
          { $unwind: "$biodata" },
          {
            $project: {
              _id: 0,
              biodataId: 1,
              transactionId: 1,
              status: 1,
              email: 1,
              mobileNumber: "$biodata.mobileNumber",
              contactEmail: "$biodata.email",
              contactName: "$biodata.name",
            },
          },
        ])
        .toArray();

      res.send(result);
    });

    // all calculate for user and revenue
    app.get("/admin-stats", verifyToken, verifyAdmin, async (req, res) => {
      // total biodat count
      const totalBiodata = await biodataCollection.estimatedDocumentCount();
      // total male biodata count
      const totalMaleBiodata = await biodataCollection.countDocuments({
        biodataType: "Male",
      });
      // total female biodata count
      const totalFemaleBiodata = await biodataCollection.countDocuments({
        biodataType: "Female",
      });
      // total premium biodata count
      const totalPremiumBiodata = await biodataCollection.countDocuments({
        isPremium: "premium",
      });

      // total revenue calculation
      const totalContactPrice = await paymentsCollection
        .aggregate([
          {
            $group: {
              _id: null,
              totalRevenue: {
                $sum: "$amount",
              },
            },
          },
        ])
        .toArray();
      const revenue =
        totalContactPrice.length > 0 ? totalContactPrice[0].totalRevenue : 0;
      res.send({
        revenue,
        totalBiodata,
        totalMaleBiodata,
        totalFemaleBiodata,
        totalPremiumBiodata,
      });
    });

    // payment related apis
    // create payment intent
    app.post("/create-payment-intent", verifyToken, async (req, res) => {
      const amount = 500;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // save payment information to db
    app.post("/payment", async (req, res) => {
      const paymentInfo = req.body;
      const result = await paymentsCollection.insertOne(paymentInfo);
      res.send(result);
    });

    // get user stats
    app.get("/users-stats", async (req, res) => {
      // total biodat count
      const totalBiodata = await biodataCollection.estimatedDocumentCount();
      // total Boys biodata count
      const totalBoysBiodata = await biodataCollection.countDocuments({
        biodataType: "Male",
      });
      // total girls biodata count
      const totalGirlsBiodata = await biodataCollection.countDocuments({
        biodataType: "Female",
      });

      // marrige compeleted count
      const totalMarrigeComplete =
        await successStoryCollection.estimatedDocumentCount();
      res.send({
        totalBiodata,
        totalBoysBiodata,
        totalGirlsBiodata,
        totalMarrigeComplete,
      });
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
