// @flow
import type { StorageService } from '../storage';
import type { RoleService } from '../role';
import type { PermissionService } from '../permission';

import type { Chapter, ChapterID } from '../../models/atlas/chapter';

import type { UserID } from '../../lib/user';
import type { PermissionID } from '../../lib/permission';
import type { Indexer } from '../../lib/indexer';
import { userHasPermission, addRoleWithPermissionsAndUsers } from '../role';
import { KeyNotFoundError, KeyAlreadyExistsError } from '../storage';
import { buildNewChapter } from '../../models/atlas/chapter';

export type ChapterService = {
  getChapter: (userId: UserID, chapterId: ChapterID) => Promise<Chapter>,
  addNewChapter: (userId: UserID, chapterName: string) => Promise<Chapter>,
  getAllChapters: (userId: UserID) => Promise<Array<Chapter>>,
};

export class InsufficientPermissionsError extends Error {
  constructor(message: string) {
    super(`InsufficientPermissionsError: ${message}`);
  }
}

export class ChapterNotFoundError extends Error {
  constructor(chapterId: ChapterID, cause: Error) {
    super(`ChapterNotFoundError: Could not find chapter '${chapterId}'\n${cause.message}`);
    this.stack = cause.stack;
  }
}

const enhanceGet = (get) => async (chapterId: ChapterID) => {
  try {
    return await get(chapterId);
  } catch (err) {
    switch (true) {
    case err instanceof KeyNotFoundError:
      throw new ChapterNotFoundError(chapterId, err);
    default:
      throw err;
    }
  }
};

const enhanceSet = (set) => async (chapterId: ChapterID, chapter: Chapter) => {
  try {
    return await set(chapterId, chapter);
  } catch (err) {
    switch (true) {
    case err instanceof KeyAlreadyExistsError:
    default:
      throw err;
    }
  }
};

export const enhanceChapterStorage = (chapterStorageService: StorageService<ChapterID, Chapter>) => ({
  getStoredChapter: enhanceGet(chapterStorageService.read),
  setStoredChapter: enhanceSet(chapterStorageService.create),
});

export const buildChapterService = (
  chapterStorageService: StorageService<ChapterID, Chapter>,
  roleService: RoleService,
  permissionService: PermissionService,
  globalChapterAddPermissionId: PermissionID,
  getChaptersByReadPermissions: Indexer<Chapter, UserID>,
): ChapterService => {
  const { getStoredChapter, setStoredChapter } = enhanceChapterStorage(chapterStorageService);

  const getChapter = async (userId, chapterId) => {
    const chapter = await getStoredChapter(chapterId);
    if (!(await userHasPermission(roleService, userId, chapter.readPermission))) {
      throw new InsufficientPermissionsError('User does not have a role that can read for the chapter');
    }
    return chapter;
  };

  const getAllChapters = async (userId) => {
    return getChaptersByReadPermissions(userId);
  };

  const addNewChapter = async (userId, chapterName) => {
    if (!userHasPermission(roleService, userId, globalChapterAddPermissionId)) {
      throw new InsufficientPermissionsError('User does not have a role that can add a chapter');
    }
    const readPermission = await permissionService.addNewPermission();
    const masterPermission = await permissionService.addNewPermission();
    await addRoleWithPermissionsAndUsers(
      roleService,
      [userId],
      [readPermission.id, masterPermission.id],
    );

    const newChapter = buildNewChapter(chapterName, readPermission.id, masterPermission.id);

    await setStoredChapter(newChapter.id, newChapter);
    return newChapter;
  };
  return {
    getChapter,
    getAllChapters,
    addNewChapter,
  };
};
