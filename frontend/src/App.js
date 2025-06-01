import React, { useState, useEffect } from "react";
import "./App.css";
import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Task Component
const TaskCard = ({ task, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState({
    title: task.title,
    description: task.description,
    status: task.status,
    priority: task.priority
  });

  const handleUpdate = async () => {
    await onUpdate(task.id, editData);
    setIsEditing(false);
  };

  const statusColors = {
    "Todo": "bg-purple-100 text-purple-800",
    "In Progress": "bg-blue-100 text-blue-800", 
    "Done": "bg-green-100 text-green-800"
  };

  const priorityColors = {
    "Low": "bg-gray-100 text-gray-800",
    "Medium": "bg-yellow-100 text-yellow-800",
    "High": "bg-red-100 text-red-800"
  };

  if (isEditing) {
    return (
      <div className="stats-card p-4 mb-4">
        <input
          className="w-full mb-2 p-2 border rounded-xl"
          value={editData.title}
          onChange={(e) => setEditData({...editData, title: e.target.value})}
          placeholder="タスク名"
        />
        <textarea
          className="w-full mb-2 p-2 border rounded-xl"
          value={editData.description}
          onChange={(e) => setEditData({...editData, description: e.target.value})}
          placeholder="説明"
          rows="2"
        />
        <div className="flex gap-2 mb-2">
          <select
            className="p-2 border rounded-xl"
            value={editData.status}
            onChange={(e) => setEditData({...editData, status: e.target.value})}
          >
            <option value="Todo">Todo</option>
            <option value="In Progress">In Progress</option>
            <option value="Done">Done</option>
          </select>
          <select
            className="p-2 border rounded-xl"
            value={editData.priority}
            onChange={(e) => setEditData({...editData, priority: e.target.value})}
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button 
            onClick={handleUpdate}
            className="px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600"
          >
            保存
          </button>
          <button 
            onClick={() => setIsEditing(false)}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400"
          >
            キャンセル
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stats-card p-4 mb-4 hover:transform hover:translate-y-[-2px] transition-all duration-200">
      <div className="flex justify-between items-start mb-2">
        <h3 className="font-semibold text-lg text-gray-800">{task.title}</h3>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsEditing(true)}
            className="text-purple-500 hover:text-purple-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button 
            onClick={() => onDelete(task.id)}
            className="text-red-500 hover:text-red-700"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
      {task.description && (
        <p className="text-gray-600 mb-3">{task.description}</p>
      )}
      <div className="flex gap-2 items-center">
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[task.status]}`}>
          {task.status}
        </span>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${priorityColors[task.priority]}`}>
          {task.priority}
        </span>
        {task.notion_id && (
          <span className="px-3 py-1 rounded-full text-sm font-medium bg-indigo-100 text-indigo-800">
            📝 Notion連携済み
          </span>
        )}
      </div>
    </div>
  );
};

// Add Task Form
const AddTaskForm = ({ onAdd }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    status: "Todo",
    priority: "Medium"
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.title.trim()) {
      await onAdd(formData);
      setFormData({ title: "", description: "", status: "Todo", priority: "Medium" });
      setIsOpen(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="w-full p-4 border-2 border-dashed border-purple-300 rounded-2xl text-purple-500 hover:border-purple-500 hover:text-purple-700 transition-colors duration-200"
      >
        <div className="flex items-center justify-center gap-2">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          新しいタスクを追加
        </div>
      </button>
    );
  }

  return (
    <div className="stats-card p-4 mb-4">
      <form onSubmit={handleSubmit}>
        <input
          className="w-full mb-3 p-3 border rounded-xl focus:border-purple-500 focus:outline-none"
          value={formData.title}
          onChange={(e) => setFormData({...formData, title: e.target.value})}
          placeholder="タスク名を入力"
          autoFocus
        />
        <textarea
          className="w-full mb-3 p-3 border rounded-xl focus:border-purple-500 focus:outline-none"
          value={formData.description}
          onChange={(e) => setFormData({...formData, description: e.target.value})}
          placeholder="説明（オプション）"
          rows="2"
        />
        <div className="flex gap-2 mb-3">
          <select
            className="p-2 border rounded-xl focus:border-purple-500 focus:outline-none"
            value={formData.status}
            onChange={(e) => setFormData({...formData, status: e.target.value})}
          >
            <option value="Todo">Todo</option>
            <option value="In Progress">In Progress</option>
            <option value="Done">Done</option>
          </select>
          <select
            className="p-2 border rounded-xl focus:border-purple-500 focus:outline-none"
            value={formData.priority}
            onChange={(e) => setFormData({...formData, priority: e.target.value})}
          >
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button 
            type="submit"
            className="px-4 py-2 bg-purple-500 text-white rounded-xl hover:bg-purple-600 transition-colors duration-200"
          >
            追加
          </button>
          <button 
            type="button"
            onClick={() => setIsOpen(false)}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 transition-colors duration-200"
          >
            キャンセル
          </button>
        </div>
      </form>
    </div>
  );
};

// Main App
function App() {
  const [tasks, setTasks] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    fetchTasks();
    fetchSyncStatus();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await axios.get(`${API}/tasks`);
      setTasks(response.data);
    } catch (error) {
      console.error("タスクの取得に失敗しました:", error);
    }
  };

  const fetchSyncStatus = async () => {
    try {
      const response = await axios.get(`${API}/sync/status`);
      setSyncStatus(response.data);
    } catch (error) {
      console.error("同期ステータスの取得に失敗しました:", error);
    }
  };

  const addTask = async (taskData) => {
    try {
      await axios.post(`${API}/tasks`, taskData);
      fetchTasks();
      fetchSyncStatus();
    } catch (error) {
      console.error("タスクの追加に失敗しました:", error);
    }
  };

  const updateTask = async (taskId, updateData) => {
    try {
      await axios.put(`${API}/tasks/${taskId}`, updateData);
      fetchTasks();
      fetchSyncStatus();
    } catch (error) {
      console.error("タスクの更新に失敗しました:", error);
    }
  };

  const deleteTask = async (taskId) => {
    if (window.confirm("このタスクを削除しますか？")) {
      try {
        await axios.delete(`${API}/tasks/${taskId}`);
        fetchTasks();
        fetchSyncStatus();
      } catch (error) {
        console.error("タスクの削除に失敗しました:", error);
      }
    }
  };

  const manualSync = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post(`${API}/sync`);
      console.log("同期完了:", response.data);
      fetchTasks();
      fetchSyncStatus();
    } catch (error) {
      console.error("同期に失敗しました:", error);
      alert("同期に失敗しました。Notionの設定を確認してください。");
    } finally {
      setIsLoading(false);
    }
  };

  const filteredTasks = tasks.filter(task => {
    if (filter === "all") return true;
    return task.status === filter;
  });

  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === "Todo").length,
    inProgress: tasks.filter(t => t.status === "In Progress").length,
    done: tasks.filter(t => t.status === "Done").length
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-100 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">📝 Notion タスクマネージャー</h1>
          <p className="text-gray-600">Notionと連携するスマートなタスク管理</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="stats-card stats-card-total p-4 text-center">
            <h3 className="text-2xl font-bold text-white">{stats.total}</h3>
            <p className="text-purple-100">総タスク数</p>
          </div>
          <div className="stats-card bg-gradient-to-br from-yellow-400 to-orange-500 p-4 text-center">
            <h3 className="text-2xl font-bold text-white">{stats.todo}</h3>
            <p className="text-yellow-100">Todo</p>
          </div>
          <div className="stats-card bg-gradient-to-br from-blue-400 to-blue-600 p-4 text-center">
            <h3 className="text-2xl font-bold text-white">{stats.inProgress}</h3>
            <p className="text-blue-100">進行中</p>
          </div>
          <div className="stats-card bg-gradient-to-br from-green-400 to-green-600 p-4 text-center">
            <h3 className="text-2xl font-bold text-white">{stats.done}</h3>
            <p className="text-green-100">完了</p>
          </div>
        </div>

        {/* Sync Status & Controls */}
        <div className="stats-card p-4 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">Notion同期ステータス</h3>
              {syncStatus && (
                <div className="flex items-center gap-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    syncStatus.status === 'synced' ? 'bg-green-100 text-green-800' :
                    syncStatus.status === 'not_configured' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {syncStatus.status === 'synced' ? '✅ 同期済み' :
                     syncStatus.status === 'not_configured' ? '❌ 未設定' :
                     '⚠️ 同期が必要'}
                  </span>
                  <span className="text-gray-600">
                    {syncStatus.synced_tasks}/{syncStatus.total_tasks} タスクが同期済み
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={manualSync}
              disabled={isLoading}
              className="px-4 py-2 bg-indigo-500 text-white rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-colors duration-200"
            >
              {isLoading ? "同期中..." : "📝 Notionと同期"}
            </button>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="stats-card p-4 mb-6">
          <div className="flex gap-2">
            {[
              { key: "all", label: "すべて" },
              { key: "Todo", label: "Todo" },
              { key: "In Progress", label: "進行中" },
              { key: "Done", label: "完了" }
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`px-4 py-2 rounded-xl transition-colors duration-200 ${
                  filter === key
                    ? "bg-purple-500 text-white"
                    : "bg-gray-200 text-gray-700 hover:bg-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tasks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">タスク一覧</h2>
            <AddTaskForm onAdd={addTask} />
            {filteredTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onUpdate={updateTask}
                onDelete={deleteTask}
              />
            ))}
            {filteredTasks.length === 0 && (
              <div className="stats-card p-8 text-center">
                <p className="text-gray-500">タスクがありません</p>
                <p className="text-sm text-gray-400 mt-2">
                  {filter === "all" ? "新しいタスクを追加してください" : `${filter}のタスクがありません`}
                </p>
              </div>
            )}
          </div>

          {/* Setup Instructions */}
          <div>
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Notion連携設定</h2>
            <div className="stats-card p-6">
              <h3 className="font-semibold mb-3">設定手順:</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700">
                <li>
                  <a href="https://www.notion.so/my-integrations" target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline">
                    Notion Integration
                  </a>
                  を作成
                </li>
                <li>Internal Integrationを選択</li>
                <li>トークン（secret_で始まる）をコピー</li>
                <li>Notionでタスク用データベースを作成</li>
                <li>データベースの「共有」→Integrationを追加</li>
                <li>Database IDをURLから取得</li>
                <li>サーバーの.envファイルに設定を追加</li>
              </ol>
              <div className="mt-4 p-3 bg-gray-100 rounded-xl">
                <p className="text-xs font-mono text-gray-700">
                  NOTION_TOKEN="secret_xxx"<br/>
                  NOTION_DATABASE_ID="xxx"
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
