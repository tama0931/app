const { MongoClient } = require('mongodb');

let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  const db = client.db(process.env.DB_NAME);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { db } = await connectToDatabase();
    
    // Health check
    if (event.path === '/.netlify/functions/api/health') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'healthy',
          notion_status: process.env.NOTION_TOKEN ? 'connected' : 'not_configured',
          timestamp: new Date().toISOString()
        })
      };
    }

    // Get all tasks
    if (event.path === '/.netlify/functions/api/tasks' && event.httpMethod === 'GET') {
      const tasks = await db.collection('tasks').find({}).sort({ created_at: -1 }).toArray();
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(tasks)
      };
    }

    // Create task
    if (event.path === '/.netlify/functions/api/tasks' && event.httpMethod === 'POST') {
      const taskData = JSON.parse(event.body);
      const task = {
        id: require('crypto').randomUUID(),
        title: taskData.title,
        description: taskData.description || '',
        status: taskData.status || 'Todo',
        priority: taskData.priority || 'Medium',
        due_date: taskData.due_date || null,
        notion_id: null,
        created_at: new Date(),
        updated_at: new Date()
      };

      await db.collection('tasks').insertOne(task);
      
      // Sync to Notion if configured
      if (process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID) {
        await syncToNotion(task);
      }

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(task)
      };
    }

    // Update task
    if (event.path.startsWith('/.netlify/functions/api/tasks/') && event.httpMethod === 'PUT') {
      const taskId = event.path.split('/').pop();
      const updateData = JSON.parse(event.body);
      updateData.updated_at = new Date();

      await db.collection('tasks').updateOne({ id: taskId }, { $set: updateData });
      const updatedTask = await db.collection('tasks').findOne({ id: taskId });

      // Sync to Notion if configured
      if (process.env.NOTION_TOKEN && process.env.NOTION_DATABASE_ID && updatedTask) {
        await syncToNotion(updatedTask);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(updatedTask)
      };
    }

    // Delete task
    if (event.path.startsWith('/.netlify/functions/api/tasks/') && event.httpMethod === 'DELETE') {
      const taskId = event.path.split('/').pop();
      await db.collection('tasks').deleteOne({ id: taskId });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ message: 'Task deleted successfully' })
      };
    }

    // Manual sync
    if (event.path === '/.netlify/functions/api/sync' && event.httpMethod === 'POST') {
      if (!process.env.NOTION_TOKEN || !process.env.NOTION_DATABASE_ID) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Notion not configured' })
        };
      }

      // Simple sync response (Notion integration can be added later)
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          status: 'success',
          synced_from_notion: 0,
          synced_to_notion: 0,
          timestamp: new Date().toISOString()
        })
      };
    }

    // Sync status
    if (event.path === '/.netlify/functions/api/sync/status' && event.httpMethod === 'GET') {
      const totalTasks = await db.collection('tasks').countDocuments({});
      const syncedTasks = await db.collection('tasks').countDocuments({ notion_id: { $exists: true } });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          total_tasks: totalTasks,
          synced_tasks: syncedTasks,
          status: process.env.NOTION_TOKEN ? 'ready' : 'not_configured'
        })
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Not found' })
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

async function syncToNotion(task) {
  // Basic Notion sync (can be enhanced)
  try {
    const { Client } = require('@notionhq/client');
    const notion = new Client({ auth: process.env.NOTION_TOKEN });

    const properties = {
      Name: { title: [{ text: { content: task.title } }] },
      Status: { select: { name: task.status } },
      Priority: { select: { name: task.priority } },
      Description: { rich_text: [{ text: { content: task.description || '' } }] }
    };

    if (task.due_date) {
      properties['Due Date'] = { date: { start: task.due_date } };
    }

    await notion.pages.create({
      parent: { database_id: process.env.NOTION_DATABASE_ID },
      properties
    });
  } catch (error) {
    console.error('Notion sync error:', error);
  }
}"
