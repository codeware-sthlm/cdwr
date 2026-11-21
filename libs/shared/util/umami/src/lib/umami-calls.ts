import { z } from 'zod';

import { UmamiError, UmamiNotFoundError, UmamiUserExistsError } from './errors';
import {
  type UmamiAnswer,
  type UmamiRequest,
  parseUmamiJson,
  umamiRefused
} from './umami-fetch';

const PAGE_SIZE = 100;

const UserSchema = z.object({ id: z.string(), username: z.string() });
const MeSchema = UserSchema.extend({
  role: z.enum(['admin', 'user', 'view-only'])
});
const TeamSchema = z.object({ id: z.string(), name: z.string() });

/** An Umami user */
export type UmamiUser = z.infer<typeof UserSchema>;

/** The user an api key or login belongs to */
export type UmamiIdentity = z.infer<typeof MeSchema>;

/** An Umami team */
export type UmamiTeam = z.infer<typeof TeamSchema>;

/** A member of a team, by user id */
export type UmamiTeamUser = { userId: string; role: string };

/** What a user may do in Umami */
export type UmamiUserRole = 'admin' | 'user' | 'view-only';

/** What a user may do in a team */
export type UmamiTeamRole = 'team-member' | 'team-view-only' | 'team-manager';

/** The user and team calls, over any request function */
export type UmamiCalls = {
  createUser: (input: {
    username: string;
    password: string;
    role: UmamiUserRole;
  }) => Promise<UmamiUser>;
  /** Throws `UmamiNotFoundError` when the user does not exist */
  getUser: (userId: string) => Promise<UmamiUser>;
  /** Throws `UmamiNotFoundError` when the user does not exist */
  setPassword: (userId: string, password: string) => Promise<void>;
  /** Succeeds when the user is already gone */
  deleteUser: (userId: string) => Promise<void>;
  /** Every user, read page by page; needs a login, not an api key */
  listUsers: () => Promise<UmamiUser[]>;
  /** The user the request is made as; Umami may nest it under `user` */
  whoAmI: () => Promise<UmamiIdentity>;
  /** Create a team; the creator becomes its owner */
  createTeam: (name: string) => Promise<UmamiTeam>;
  /** A team by id; `null` when Umami has no such team */
  getTeam: (teamId: string) => Promise<UmamiTeam | null>;
  /** Every team the user is a member of, read page by page */
  listTeams: () => Promise<UmamiTeam[]>;
  /** Every member of a team, read page by page */
  listTeamUsers: (teamId: string) => Promise<UmamiTeamUser[]>;
  /** Succeeds when the user is already a member */
  addTeamUser: (
    teamId: string,
    userId: string,
    role: UmamiTeamRole
  ) => Promise<void>;
  /** Succeeds when the user is not a member */
  removeTeamUser: (teamId: string, userId: string) => Promise<void>;
  /** Move a website into a team */
  transferWebsite: (websiteId: string, teamId: string) => Promise<void>;
};

/** The user and team calls over a request function, which owns auth and retries */
export const createUmamiCalls = (request: UmamiRequest): UmamiCalls => {
  /** The parsed JSON of a good answer; an unexpected shape is a bad answer */
  const parse = <T extends z.ZodType>(
    path: string,
    answer: UmamiAnswer,
    schema: T
  ): z.output<T> => {
    const parsed = schema.safeParse(parseUmamiJson(path, answer.text));
    if (!parsed.success) {
      throw new UmamiError(`Umami ${path}: unexpected answer`, 'bad-answer');
    }
    return parsed.data;
  };

  /** Every page of a list, until the count is reached */
  const readPages = async <T extends z.ZodType>(
    path: string,
    item: T
  ): Promise<Array<z.output<T>>> => {
    const items: Array<z.output<T>> = [];
    for (let page = 1; ; page++) {
      const paged = `${path}?page=${page}&pageSize=${PAGE_SIZE}`;
      const answer = await request({ path: paged });
      if (!answer.ok) throw umamiRefused(path, answer);
      const { data, count } = parse(
        path,
        answer,
        z.object({ data: z.array(item), count: z.number() })
      );
      items.push(...data);
      if (!data.length || items.length >= count) return items;
    }
  };

  const enc = encodeURIComponent;

  return {
    createUser: async ({ username, password, role }) => {
      const path = 'users';
      const answer = await request({
        path,
        method: 'POST',
        body: { username, password, role }
      });
      // Umami words its 400s in the body, so the text decides what the 400 meant
      if (answer.status === 400) {
        if (answer.text.includes('User already exists')) {
          throw new UmamiUserExistsError(username);
        }
        throw umamiRefused(path, answer);
      }
      if (!answer.ok) throw umamiRefused(path, answer);
      const { id, username: name } = parse(path, answer, UserSchema);
      return { id, username: name };
    },

    getUser: async (userId) => {
      const path = `users/${enc(userId)}`;
      const answer = await request({ path });
      if (answer.status === 404) throw new UmamiNotFoundError(userId);
      if (!answer.ok) throw umamiRefused(path, answer);
      const user = parse(path, answer, UserSchema);
      return { id: user.id, username: user.username };
    },

    setPassword: async (userId, password) => {
      const path = `users/${enc(userId)}`;
      const answer = await request({
        path,
        method: 'POST',
        body: { password },
        readBody: false
      });
      if (answer.status === 404) throw new UmamiNotFoundError(userId);
      if (!answer.ok) throw umamiRefused(path, answer);
    },

    deleteUser: async (userId) => {
      const path = `users/${enc(userId)}`;
      const answer = await request({
        path,
        method: 'DELETE',
        readBody: false
      });
      if (!answer.ok && answer.status !== 404) throw umamiRefused(path, answer);
    },

    listUsers: async () =>
      (await readPages('admin/users', UserSchema)).map((user) => ({
        id: user.id,
        username: user.username
      })),

    whoAmI: async () => {
      const path = 'me';
      const answer = await request({ path });
      if (!answer.ok) throw umamiRefused(path, answer);
      const body = parse(
        path,
        answer,
        z.object({ user: MeSchema.optional() }).passthrough()
      );
      return body.user ?? parse(path, answer, MeSchema);
    },

    createTeam: async (name) => {
      const path = 'teams';
      const answer = await request({ path, method: 'POST', body: { name } });
      if (!answer.ok) throw umamiRefused(path, answer);
      // Umami answers the transaction result: the team, then the owner's membership
      const body = parse(
        path,
        answer,
        z.union([TeamSchema, z.tuple([TeamSchema]).rest(z.unknown())])
      );
      const team = Array.isArray(body) ? body[0] : body;
      return { id: team.id, name: team.name };
    },

    // Ask the team itself: its member list answers an admin with an empty
    // page for a team that is gone
    getTeam: async (teamId) => {
      const path = `teams/${enc(teamId)}`;
      const answer = await request({ path });
      if (answer.status === 404) return null;
      if (!answer.ok) throw umamiRefused(path, answer);
      const team = parse(path, answer, TeamSchema);
      return { id: team.id, name: team.name };
    },

    listTeams: async () =>
      (await readPages('teams', TeamSchema)).map((team) => ({
        id: team.id,
        name: team.name
      })),

    listTeamUsers: async (teamId) =>
      (
        await readPages(
          `teams/${enc(teamId)}/users`,
          z.object({ userId: z.string(), role: z.string() })
        )
      ).map(({ userId, role }) => ({ userId, role })),

    addTeamUser: async (teamId, userId, role) => {
      const path = `teams/${enc(teamId)}/users`;
      const answer = await request({
        path,
        method: 'POST',
        body: { userId, role },
        readBody: false
      });
      // Umami answers 400 for a member it already has, with no way to tell it
      // from another bad request but the wording
      if (answer.status === 400) {
        if (answer.text.toLowerCase().includes('already')) return;
        throw umamiRefused(path, answer);
      }
      if (!answer.ok) throw umamiRefused(path, answer);
    },

    removeTeamUser: async (teamId, userId) => {
      const path = `teams/${enc(teamId)}/users/${enc(userId)}`;
      const answer = await request({
        path,
        method: 'DELETE',
        readBody: false
      });
      // Umami answers 400 "does not exists on this team" for a non-member
      if (
        answer.status === 400 &&
        answer.text.toLowerCase().includes('does not exist')
      ) {
        return;
      }
      if (!answer.ok && answer.status !== 404) throw umamiRefused(path, answer);
    },

    transferWebsite: async (websiteId, teamId) => {
      const path = `websites/${enc(websiteId)}/transfer`;
      const answer = await request({
        path,
        method: 'POST',
        body: { teamId },
        readBody: false
      });
      if (!answer.ok) throw umamiRefused(path, answer);
    }
  };
};
