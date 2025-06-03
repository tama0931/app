from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
from notion_client import Client
import asyncio

# Environment variables
load_dotenv()

# MongoDB connection
mongo_url = os.environ.get('MONGO_URL')
client = AsyncIOMotorClient(mongo_url) if mongo_url else None
db = client[os.environ.get('DB_NAME', 'notion_task_manager')] if client else None

# Notion client
notion_token = os.getenv('NOTION_TOKEN')
notion_database_id = os.getenv('NOTION_DATABASE_ID')
notion = None
if notion_token:
    notion = Client(auth=notion_token)

# Create the main app
app = FastAPI(title="Notion Task Manager API")

# Models
class Task(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    description: Optional[str] = ""
    status: str = "Todo"  # Todo, In Progress, Done
    priority: str = "Medium"  # Low, Medium, High
    due_date: Optional[datetime] = None
    notion_id: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class TaskCreate(BaseModel):
    title: str
    description: Optional[str] = ""
    status: str = "Todo"
    priority: str = "Medium"
    due_date: Optional[datetime] = None

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[datetime] = None

class SyncStatus(BaseModel):
    last_sync: Optional[datetime] = None
    total_tasks: int = 0
    synced_tasks: int = 0
    status: str = "ready"

# Notion Service Functions
async def sync_task_to_notion(task: Task):
    """Sync a task to Notion database"""
    if not notion or not notion_database_id:
        return None
    
    try:
        properties = {
            "Name": {"title": [{"text": {"content": task.title}}]},
            "Status": {"select": {"name": task.status}},
            "Priority": {"select": {"name": task.priority}},
            "Description": {"rich_text": [{"text": {"content": task.description or ""}}]},
        }
        
        if task.due_date:
            properties["Due Date"] = {"date": {"start": task.due_date.isoformat()}}
        
        if task.notion_id:
            # Update existing page
            response = notion.pages.update(
                page_id=task.notion_id,
                properties=properties
            )
        else:
            # Create new page
            response = notion.pages.create(
                parent={"database_id": notion_database_id},
                properties=properties
            )
            # Update task with notion_id
            if db:
                await db.tasks.update_one(
                    {"id": task.id},
                    {"$set": {"notion_id": response["id"]}}
                )
        
        return response["id"]
    except Exception as e:
        logging.error(f"Error syncing to Notion: {str(e)}")
        return None

async def sync_from_notion():
    """Sync tasks from Notion to local database"""
    if not notion or not notion_database_id or not db:
        return 0
    
    try:
        response = notion.databases.query(database_id=notion_database_id)
        synced_count = 0
        
        for page in response["results"]:
            # Parse Notion page to task
            properties = page["properties"]
            
            title = ""
            if "Name" in properties and properties["Name"]["title"]:
                title = properties["Name"]["title"][0]["text"]["content"]
            
            status = "Todo"
            if "Status" in properties and properties["Status"]["select"]:
                status = properties["Status"]["select"]["name"]
            
            priority = "Medium"
            if "Priority" in properties and properties["Priority"]["select"]:
                priority = properties["Priority"]["select"]["name"]
            
            description = ""
            if "Description" in properties and properties["Description"]["rich_text"]:
                description = properties["Description"]["rich_text"][0]["text"]["content"]
            
            due_date = None
            if "Due Date" in properties and properties["Due Date"]["date"]:
                due_date = datetime.fromisoformat(properties["Due Date"]["date"]["start"])
            
            # Check if task already exists
            existing_task = await db.tasks.find_one({"notion_id": page["id"]})
            
            if existing_task:
                # Update existing task
                await db.tasks.update_one(
                    {"notion_id": page["id"]},
                    {"$set": {
                        "title": title,
                        "description": description,
                        "status": status,
                        "priority": priority,
                        "due_date": due_date,
                        "updated_at": datetime.utcnow()
                    }}
                )
            else:
                # Create new task
                task = Task(
                    title=title,
                    description=description,
                    status=status,
                    priority=priority,
                    due_date=due_date,
                    notion_id=page["id"]
                )
                await db.tasks.insert_one(task.dict())
            
            synced_count += 1
        
        return synced_count
    except Exception as e:
        logging.error(f"Error syncing from Notion: {str(e)}")
        return 0

# API Routes
@app.get("/api/")
async def root():
    return {"message": "Notion Task Manager API"}

@app.get("/api/health")
async def health_check():
    notion_status = "connected" if notion and notion_database_id else "not_configured"
    db_status = "connected" if db else "not_connected"
    return {
        "status": "healthy",
        "notion_status": notion_status,
        "db_status": db_status,
        "timestamp": datetime.utcnow()
    }

# Task Routes
@app.post("/api/tasks", response_model=Task)
async def create_task(task_create: TaskCreate):
    if not db:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    task = Task(**task_create.dict())
    await db.tasks.insert_one(task.dict())
    
    # Sync to Notion in background
    if notion and notion_database_id:
        await sync_task_to_notion(task)
    
    return task

@app.get("/api/tasks", response_model=List[Task])
async def get_tasks():
    if not db:
        return []
    
    tasks = await db.tasks.find().sort("created_at", -1).to_list(1000)
    return [Task(**task) for task in tasks]

@app.get("/api/tasks/{task_id}", response_model=Task)
async def get_task(task_id: str):
    if not db:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return Task(**task)

@app.put("/api/tasks/{task_id}", response_model=Task)
async def update_task(task_id: str, task_update: TaskUpdate):
    if not db:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    update_data = {k: v for k, v in task_update.dict().items() if v is not None}
    update_data["updated_at"] = datetime.utcnow()
    
    result = await db.tasks.update_one(
        {"id": task_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    updated_task = await db.tasks.find_one({"id": task_id})
    task = Task(**updated_task)
    
    # Sync to Notion in background
    if notion and notion_database_id:
        await sync_task_to_notion(task)
    
    return task

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: str):
    if not db:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    result = await db.tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted successfully"}

# Sync Routes
@app.post("/api/sync")
async def manual_sync():
    """Manually trigger bidirectional sync with Notion"""
    if not notion or not notion_database_id:
        raise HTTPException(status_code=400, detail="Notion not configured")
    
    if not db:
        raise HTTPException(status_code=500, detail="Database not connected")
    
    try:
        # Sync FROM Notion
        synced_count = await sync_from_notion()
        
        # Sync TO Notion (existing local tasks without notion_id)
        local_tasks = await db.tasks.find({"notion_id": {"$exists": False}}).to_list(1000)
        synced_to_notion = 0
        
        for task_doc in local_tasks:
            task = Task(**task_doc)
            notion_id = await sync_task_to_notion(task)
            if notion_id:
                synced_to_notion += 1
        
        return {
            "status": "success",
            "synced_from_notion": synced_count,
            "synced_to_notion": synced_to_notion,
            "timestamp": datetime.utcnow()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")

@app.get("/api/sync/status", response_model=SyncStatus)
async def get_sync_status():
    if not db:
        return SyncStatus(status="db_not_connected")
    
    total_tasks = await db.tasks.count_documents({})
    synced_tasks = await db.tasks.count_documents({"notion_id": {"$exists": True}})
    
    status = "ready"
    if not notion or not notion_database_id:
        status = "not_configured"
    elif synced_tasks == 0 and total_tasks > 0:
        status = "needs_sync"
    elif synced_tasks == total_tasks:
        status = "synced"
    
    return SyncStatus(
        total_tasks=total_tasks,
        synced_tasks=synced_tasks,
        status=status
    )

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Vercel handler
handler = app
