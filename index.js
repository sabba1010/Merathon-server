const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// 🔐 Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'https://your-frontend-domain.com'],
  credentials: true
}));
app.use(express.json());

// 🔗 MongoDB Setup
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.djvkmk5.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// 📦 DB Collections
let marathonCollection;
let registrationCollection;

// 🔐 JWT Middleware
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send({ message: 'No token provided' });

  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).send({ message: 'Invalid token' });

    req.decoded = decoded;
    next();
  });
}

// 🔌 Connect to MongoDB
async function run() {
  try {
    const db = client.db('Marathon');
    marathonCollection = db.collection('Marathons');
    registrationCollection = db.collection('Registrations');
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection failed:', err);
  }
}
run().catch(console.dir);

// 🌐 Routes

// ✅ Root
app.get('/', (req, res) => {
  res.send('🏃‍♂️ Marathon server is running!');
});

// ✅ JWT Token Create
app.post('/jwt', (req, res) => {
  const user = req.body;
  if (!user?.email) {
    return res.status(400).send({ message: 'Email required' });
  }

  const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '2h' });
  res.send({ token });
});

// ✅ Get All Marathons
app.get('/marathons', async (req, res) => {
  const sortOrder = req.query.sort === 'asc' ? 1 : -1;
  const filter = {};

  if (req.query.createdBy) {
    filter.createdBy = req.query.createdBy;
  }

  try {
    const result = await marathonCollection.find(filter).sort({ createdAt: sortOrder }).toArray();
    res.send(result);
  } catch (err) {
    res.status(500).send({ error: 'Failed to load marathons' });
  }
});

// ✅ Single Marathon by ID
app.get('/marathons/:id', async (req, res) => {
  const { id } = req.params;
  if (!ObjectId.isValid(id)) return res.status(400).send({ message: 'Invalid ID' });

  const marathon = await marathonCollection.findOne({ _id: new ObjectId(id) });
  if (!marathon) return res.status(404).send({ message: 'Not found' });

  res.send(marathon);
});

// ✅ Create Marathon
app.post('/marathons', async (req, res) => {
  const marathon = req.body;
  if (!marathon?.title || !marathon?.location || !marathon?.createdBy) {
    return res.status(400).send({ message: 'Missing fields' });
  }

  marathon.registrationCount = 0;
  marathon.createdAt = new Date();

  const result = await marathonCollection.insertOne(marathon);
  res.send(result);
});

// ✅ Update Marathon
app.patch('/marathons/:id', async (req, res) => {
  const { id } = req.params;
  const update = req.body;

  const result = await marathonCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: update }
  );

  res.send(result);
});

// ✅ Delete Marathon
app.delete('/marathons/:id', async (req, res) => {
  const { id } = req.params;

  const result = await marathonCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// ✅ Get My Registrations (Protected)
app.get('/registrations', verifyToken, async (req, res) => {
  const decodedEmail = req.decoded.email;
  const email = req.query.email;

  if (decodedEmail !== email) {
    return res.status(403).send({ message: 'Forbidden: token mismatch' });
  }

  try {
    const result = await registrationCollection.find({ email }).toArray();
    res.send(result);
  } catch {
    res.status(500).send({ message: 'Fetch error' });
  }
});

// ✅ Register Marathon (Fixed + Protected)
app.post('/registrations', verifyToken, async (req, res) => {
  const decodedEmail = req.decoded.email;
  const {
    marathonId,
    participantName,
    contactNumber,
    address,
    email,
  } = req.body;

  if (email !== decodedEmail) {
    return res.status(403).send({ message: 'Email mismatch' });
  }

  if (!marathonId || !participantName || !contactNumber || !address || !email) {
    return res.status(400).send({ message: 'Missing required fields' });
  }

  try {
    const marathon = await marathonCollection.findOne({ _id: new ObjectId(marathonId) });

    if (!marathon) {
      return res.status(404).send({ message: 'Marathon not found' });
    }

    const registration = {
      marathonId,
      marathonTitle: marathon.title,
      registrationFee: marathon.registrationFee || 'Free',
      location: marathon.location || 'N/A',
      startDate: marathon.eventDate || marathon.marathonDate || 'TBD',
      participantName,
      contactNumber,
      address,
      email,
      createdAt: new Date(),
    };

    const result = await registrationCollection.insertOne(registration);
    res.status(201).send({ message: 'Registration successful', insertedId: result.insertedId });
  } catch (err) {
    console.error(err);
    res.status(500).send({ message: 'Registration failed' });
  }
});

// ✅ Update Registration
app.patch('/registrations/:id', async (req, res) => {
  const { id } = req.params;
  const update = req.body;

  const result = await registrationCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: update }
  );
  res.send(result);
});

// ✅ Delete Registration
app.delete('/registrations/:id', async (req, res) => {
  const { id } = req.params;

  const result = await registrationCollection.deleteOne({ _id: new ObjectId(id) });
  res.send(result);
});

// ✅ PUT Registration (Full Update)
app.put('/registrations/:id', async (req, res) => {
  const { id } = req.params;
  const updatedData = req.body;

  const result = await registrationCollection.updateOne(
    { _id: new ObjectId(id) },
    { $set: updatedData }
  );
  res.send(result);
});

// ✅ Start Server
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});


