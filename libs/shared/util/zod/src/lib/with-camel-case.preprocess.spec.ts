import { z } from 'zod';

import { withCamelCase } from './with-camel-case.preprocess';

describe('withCamelCase', () => {
  it('should handle empty objects', () => {
    const schema = withCamelCase(z.object({}));
    expect(schema.parse({})).toEqual({});
  });

  it('should transform basic object keys', () => {
    const schema = withCamelCase(
      z.object({
        id: z.string(),
        firstName: z.string(),
        lastName: z.string()
      })
    );

    const result = schema.parse({
      ID: 'test',
      FirstName: 'John',
      LastName: 'Doe'
    });

    expect(result).toEqual({
      id: 'test',
      firstName: 'John',
      lastName: 'Doe'
    });
  });

  it('should transform deeply nested objects', () => {
    const schema = withCamelCase(
      z.object({
        id: z.string(),
        userDetails: z.object({
          personalInfo: z.object({
            firstName: z.string(),
            lastName: z.string()
          }),
          preferences: z.object({
            emailNotifications: z.boolean()
          })
        })
      })
    );

    const result = schema.parse({
      ID: 'test',
      UserDetails: {
        PersonalInfo: {
          FirstName: 'John',
          LastName: 'Doe'
        },
        Preferences: {
          EmailNotifications: true
        }
      }
    });

    expect(result).toEqual({
      id: 'test',
      userDetails: {
        personalInfo: {
          firstName: 'John',
          lastName: 'Doe'
        },
        preferences: {
          emailNotifications: true
        }
      }
    });
  });

  it('should transform arrays of objects', () => {
    const schema = withCamelCase(
      z.object({
        users: z.array(
          z.object({
            id: z.string(),
            firstName: z.string()
          })
        )
      })
    );

    const result = schema.parse({
      Users: [
        { ID: '1', FirstName: 'John' },
        { ID: '2', FirstName: 'Jane' }
      ]
    });

    expect(result).toEqual({
      users: [
        { id: '1', firstName: 'John' },
        { id: '2', firstName: 'Jane' }
      ]
    });
  });

  it('should preserve non-object values', () => {
    const schema = withCamelCase(
      z.object({
        id: z.string(),
        data: z.union([z.string(), z.number(), z.boolean(), z.null()])
      })
    );

    const result = schema.parse({
      ID: 'test',
      Data: null
    });

    expect(result).toEqual({
      id: 'test',
      data: null
    });
  });

  it('should handle optional fields', () => {
    const schema = withCamelCase(
      z.object({
        id: z.string(),
        optionalField: z.string().optional()
      })
    );

    const result = schema.parse({
      ID: 'test'
    });

    expect(result).toEqual({
      id: 'test'
    });
  });

  it('should handle uppercase keys', () => {
    const schema = withCamelCase(z.object({ idkey: z.string() }));

    expect(schema.parse({ IDKEY: 'test' })).toEqual({ idkey: 'test' });
  });

  it('should not fully transform mixed case inputs', () => {
    const schema = withCamelCase(
      z.object({
        id: z.string(),
        aPIKey: z.string(),
        userID: z.string()
      })
    );

    const result = schema.parse({
      ID: 'test',
      APIKey: 'key123',
      UserID: 'user123'
    });

    expect(result).toEqual({
      id: 'test',
      aPIKey: 'key123',
      userID: 'user123'
    });
  });

  it('should handle mixed case inputs with special cases option', () => {
    const schema = withCamelCase(
      z.object({
        id: z.string(),
        apiKey: z.string(),
        userId: z.string()
      }),
      { specialCases: { APIKey: 'apiKey', UserID: 'userId' } }
    );

    const result = schema.parse({
      ID: 'test',
      APIKey: 'key123',
      UserID: 'user123'
    });

    expect(result).toEqual({
      id: 'test',
      apiKey: 'key123',
      userId: 'user123'
    });
  });

  it('should transform special values', () => {
    const schema = withCamelCase(
      z.object({ id: z.string(), env: z.record(z.string(), z.string()) })
    );

    const result = schema.parse({
      id: 'test',
      env: {
        API_KEY: 'key123',
        USER_ID: 'user123',
        NODE_ENV: 'production'
      }
    });

    expect(result).toEqual({
      id: 'test',
      env: {
        apiKey: 'key123',
        userId: 'user123',
        nodeEnv: 'production'
      }
    });
  });

  it('should not transform special values with preserve option', () => {
    const schema = withCamelCase(
      z.object({ id: z.string(), env: z.record(z.string(), z.string()) }),
      { preserve: ['env'] }
    );

    const result = schema.parse({
      ID: 'test',
      env: {
        API_KEY: 'key123',
        USER_ID: 'user123',
        NODE_ENV: 'production'
      }
    });

    expect(result).toEqual({
      id: 'test',
      env: {
        API_KEY: 'key123',
        USER_ID: 'user123',
        NODE_ENV: 'production'
      }
    });
  });

  it('should handle regex metacharacters in preserve paths', () => {
    const schema = withCamelCase(
      z.object({ id: z.string(), 'a(b': z.record(z.string(), z.string()) }),
      { preserve: ['a(b'] }
    );

    const result = schema.parse({
      ID: 'test',
      'a(b': { API_KEY: 'key123' }
    });

    expect(result).toEqual({
      id: 'test',
      'a(b': { API_KEY: 'key123' }
    });
  });

  it('should use transformed keys in preserve option', () => {
    const schema = withCamelCase(
      z.object({
        id: z.string(),
        meta: z.object({ env: z.record(z.string(), z.string()) })
      }),
      { preserve: ['meta.env'] }
    );

    const result = schema.parse({
      ID: 'test',
      Meta: {
        Env: {
          API_KEY: 'key123'
        }
      }
    });

    expect(result).toEqual({
      id: 'test',
      meta: {
        env: {
          API_KEY: 'key123'
        }
      }
    });
  });

  it('should preserve paths in arrays', () => {
    const schema = withCamelCase(
      z.object({
        id: z.string(),
        data: z.array(z.object({ env: z.record(z.string(), z.string()) }))
      }),
      { preserve: ['data.env'] }
    );

    expect(
      schema.parse({ ID: 'test', Data: [{ env: { NODE_ENV: 'test' } }] })
    ).toEqual({
      id: 'test',
      data: [{ env: { NODE_ENV: 'test' } }]
    });
  });

  it('should throw on invalid data', () => {
    const schema = withCamelCase(
      z.object({
        id: z.string(),
        required: z.string()
      })
    );

    expect(() =>
      schema.parse({
        ID: 'test'
        // Missing 'Required' field
      })
    ).toThrow();
  });
});
