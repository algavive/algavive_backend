CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT UNIQUE,
  pass_hash TEXT,
  google_id TEXT UNIQUE,
  username TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  admin INTEGER DEFAULT 0, /*аерархия прав будет 1 это админы с правами, а 2 это владелец*/
  avatarUrl TEXT,
  userIcon TEXT,
  userTitle TEXT
);

CREATE TABLE users_api_limits (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  /*api лимиты, действия за день*/
  api_limit_change_username INTEGER NOT NULL DEFAULT 3, /*то есть 3 раза в день можно менять юзернейм*/
  /*api_limit_create_projects INTEGER NOT NULL DEFAULT 10,*/
  PRIMARY KEY (user_id)
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  imageUrl TEXT NULL,
  likes_count INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  views_count INTEGER NOT NULL DEFAULT 0,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  description TEXT,
  is_trends INTEGER NULL, /*0 или NULL - false(остается без трендов, для is_entertaiment они не могут в is_trend, занимать что-то выше нуля), 1 - тренды*/
  is_entertaiment INTEGER NULL, /*публикация в центр развлечений и при публикации сам по умолчанию*/
  is_published INTEGER NOT NULL /*0 - не опубликован, 1 - опубликован(с параметрами is_trend и is_entertaiment)*/
);

CREATE TABLE comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_reply INTEGER NOT NULL, /*0-false , выше 1 - true*/
  reply_id INTEGER /*Зависит от условия и reply_id, но если reply_id = false, то игнорирует его, если true, то цепляется за айди комментария*/
);

CREATE TABLE likes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projects_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, projects_id)
);

CREATE TABLE views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  projects_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, projects_id)
);


/*
Лучше не буду трогать пока выпускаю демо релиз

CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  content TEXT,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);*/

/*
Я придумал новые права, то есть типа модератор это 1, админ это 2, вице-админ это 3, а владелец 9.

CREATE TABLE admin_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  Дальше bollean значения
  perm_delete_comments INTEGER NOT NULL DEFAULT 0,
  perm_unpublish_projects INTEGER NOT NULL DEFAULT 0,
  perm_ban_users INTEGER NOT NULL DEFAULT 0,
  perm_gives_users_icons_and_titles INTEGER NOT NULL DEFAULT 0,
  perm_publish_entertaiment INTEGER NOT NULL DEFAULT 0
);
*/

CREATE TABLE admin_log( /*Очищаться будет каждый день, будет только касаться всего, кроме perm_publish_entertaiment*/
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  content TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE admin_ban(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  user_id_who_baned INTEGER NOT NULL,
  duration TIMESTAMP
);

CREATE INDEX idx_users_login ON users(login);
CREATE INDEX idx_users_google_id ON users(google_id);

/*Для самой функции поиска*/
CREATE INDEX idx_projects_title ON projects(title);
CREATE INDEX idx_users_username ON users(username);


  /*
export interface UserClient {
  logined: boolean
  name: string
  admin: boolean
  avatarUrl: string | null
  description?: string | null
  userIcon?: string
  userTitle?: string
}

export interface Project {
  id: number
  title: string
  author: string
  authorIcon?: string
  authorTitle?: string
  authorProfile?: string
  type: string
  imageUrl: string | null
  likes: number
  comments: number
  views: number
}

export interface PageProject {
  id: number
  title: string
  author: string
  authorId: number

  isLiked: boolean
  isOwner: boolean

  type: string
  imageUrl: string | null
  likes: number
  comments: number
  views: number
  description: string

  content: string | string[]
}

export interface UserCards {
  id: number
  name: string
  rankIcon?: string
  rankTitle?: string
  avatarUrl: null | string
}

export interface UserProfile {
  id: number
  name: string
  rankIcon?: string
  rankTitle?: string
  avatarUrl: null | string
  description?: string
}

export interface Reply {
  id: number,
  author: string,
  authorId: number,
  text: string,
  date: string,
  rankIcon?: string,
  rankTitle?: string
}

export interface Comments {
  id: number,
  author: string,
  authorId: number,
  text: string,
  date: string,
  rankIcon?: string,
  rankTitle?: string,
  replies: Reply[]
}

export interface Notifications {
  id: number,
  type: string,
  user: string,
  action: string,
  target: string,
  time: string,
  redirectUrl: string
}

export const Celebrity: string = `${config.STATIC_LOCATION}/seleba.png`
export const EmptyCover: string = `${config.STATIC_LOCATION}/cover.png`

export type TrendPeriod = 'day' | 'week' | 'month'
export type ProjectFilter = 'new' | 'popular' | 'discussed'
export type ProjectsTypes = 'Пост' | 'Видео' | 'Scratch' | 'Web'  
  */