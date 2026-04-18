import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { RepositoryList, RepositoryListStorage } from '../types/index.js';

/**
 * RepositoryListManager
 *
 * Manages named lists of repositories with CRUD operations.
 * Storage is file-based in .gh-lists/lists.json
 */
export class RepositoryListManager {
  private storagePath: string;
  private storage: RepositoryListStorage;

  constructor(storagePath = '.gh-lists/lists.json') {
    this.storagePath = storagePath;
    this.ensureStorageDirectory();
    this.storage = this.loadStorage();
  }

  /**
   * Create a new repository list
   */
  createList(name: string, description = '', metadata: Record<string, unknown> = {}): void {
    if (this.storage.lists[name]) {
      throw new Error(`List '${name}' already exists`);
    }

    const now = new Date().toISOString();
    this.storage.lists[name] = {
      name,
      description,
      created: now,
      updated: now,
      repositories: [],
      metadata,
    };

    this.saveStorage();
  }

  /**
   * Add a repository to a list
   */
  addRepository(listName: string, repo: string): void {
    const list = this.getList(listName);

    // Validate repository format (org/repo)
    if (!repo.includes('/')) {
      throw new Error(`Invalid repository format: ${repo}. Expected: org/repo`);
    }

    if (list.repositories.includes(repo)) {
      throw new Error(`Repository '${repo}' already in list '${listName}'`);
    }

    list.repositories.push(repo);
    list.updated = new Date().toISOString();
    this.saveStorage();
  }

  /**
   * Remove a repository from a list
   */
  removeRepository(listName: string, repo: string): void {
    const list = this.getList(listName);
    const index = list.repositories.indexOf(repo);

    if (index === -1) {
      throw new Error(`Repository '${repo}' not found in list '${listName}'`);
    }

    list.repositories.splice(index, 1);
    list.updated = new Date().toISOString();
    this.saveStorage();
  }

  /**
   * Get a list by name
   */
  getList(name: string): RepositoryList {
    const list = this.storage.lists[name];
    if (!list) {
      throw new Error(`List '${name}' not found`);
    }
    return list;
  }

  /**
   * Get all lists
   */
  getAllLists(): RepositoryList[] {
    return Object.values(this.storage.lists);
  }

  /**
   * Delete a list
   */
  deleteList(name: string): void {
    if (!this.storage.lists[name]) {
      throw new Error(`List '${name}' not found`);
    }

    delete this.storage.lists[name];
    this.saveStorage();
  }

  /**
   * Rename a list
   */
  renameList(oldName: string, newName: string): void {
    const list = this.getList(oldName);

    if (this.storage.lists[newName]) {
      throw new Error(`List '${newName}' already exists`);
    }

    list.name = newName;
    list.updated = new Date().toISOString();
    this.storage.lists[newName] = list;
    delete this.storage.lists[oldName];
    this.saveStorage();
  }

  /**
   * Update list metadata
   */
  updateList(
    name: string,
    updates: { description?: string; metadata?: Record<string, unknown> }
  ): void {
    const list = this.getList(name);

    if (updates.description !== undefined) {
      list.description = updates.description;
    }

    if (updates.metadata) {
      list.metadata = { ...list.metadata, ...updates.metadata };
    }

    list.updated = new Date().toISOString();
    this.saveStorage();
  }

  /**
   * Check if a list exists
   */
  listExists(name: string): boolean {
    return name in this.storage.lists;
  }

  /**
   * Get list names
   */
  getListNames(): string[] {
    return Object.keys(this.storage.lists);
  }

  // Private methods

  private ensureStorageDirectory(): void {
    const dir = dirname(this.storagePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  private loadStorage(): RepositoryListStorage {
    if (!existsSync(this.storagePath)) {
      return { lists: {} };
    }

    try {
      const data = readFileSync(this.storagePath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      console.error(`Error loading storage from ${this.storagePath}:`, error);
      return { lists: {} };
    }
  }

  private saveStorage(): void {
    try {
      // Atomic write: write to temp file then rename
      const tempPath = `${this.storagePath}.tmp`;
      const data = JSON.stringify(this.storage, null, 2);
      writeFileSync(tempPath, data, 'utf-8');

      // Rename is atomic on most filesystems
      writeFileSync(this.storagePath, data, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to save storage: ${error}`);
    }
  }
}
