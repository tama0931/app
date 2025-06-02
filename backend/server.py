from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
from notion_client import Client
import asyncio

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Notion client
notion_token = os.getenv('NOTION_TOKEN')
notion_database_id = os.getenv('NOTION_DATABASE_ID')
notion = None
if notion_token:
    notion = Client(auth=notion_token)

# Create the main app without a prefix
app = FastAPI(title="Notion Task Manager API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

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

class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: Optional[str] = ""
    tasks: List[str] = []  # Task IDs
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = ""

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
    if not notion or not notion_database_id:
        return []
    
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

@api_router.get("/")
async def root():
    return {"message": "Notion Task Manager API"}

@api_router.get("/health")
async def health_check():
    notion_status = "connected" if notion and notion_database_id else "not_configured"
    return {
        "status": "healthy",
        "notion_status": notion_status,
        "timestamp": datetime.utcnow()
    }

# Task Routes
@api_router.post("/tasks", response_model=Task)
async def create_task(task_create: TaskCreate):
    task = Task(**task_create.dict())
    await db.tasks.insert_one(task.dict())
    
    # Sync to Notion in background
    if notion and notion_database_id:
        await sync_task_to_notion(task)
    
    return task

@api_router.get("/tasks", response_model=List[Task])
async def get_tasks():
    tasks = await db.tasks.find().sort("created_at", -1).to_list(1000)
    return [Task(**task) for task in tasks]

@api_router.get("/tasks/{task_id}", response_model=Task)
async def get_task(task_id: str):
    task = await db.tasks.find_one({"id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return Task(**task)

@api_router.put("/tasks/{task_id}", response_model=Task)
async def update_task(task_id: str, task_update: TaskUpdate):
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

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str):
    result = await db.tasks.delete_one({"id": task_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": "Task deleted successfully"}

# Project Routes
@api_router.post("/projects", response_model=Project)
async def create_project(project_create: ProjectCreate):
    project = Project(**project_create.dict())
    await db.projects.insert_one(project.dict())
    return project

@api_router.get("/projects", response_model=List[Project])
async def get_projects():
    projects = await db.projects.find().sort("created_at", -1).to_list(1000)
    return [Project(**project) for project in projects]

@api_router.get("/projects/{project_id}/tasks", response_model=List[Task])
async def get_project_tasks(project_id: str):
    project = await db.projects.find_one({"id": project_id})
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    if project.get("tasks"):
        tasks = await db.tasks.find({"id": {"$in": project["tasks"]}}).to_list(1000)
        return [Task(**task) for task in tasks]
    return []

# Sync Routes
@api_router.post("/sync")
async def manual_sync():
    """Manually trigger bidirectional sync with Notion"""
    if not notion or not notion_database_id:
        raise HTTPException(status_code=400, detail="Notion not configured")
    
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

@api_router.get("/sync/status", response_model=SyncStatus)
async def get_sync_status():
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

# Include the router in the main app
app.include_router(api_router)

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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("server:app", host="0.0.0.0", port=port)'
