'use strict';

// We do NOT mock anything at the top level for this test, to ensure we control the mock timing.

describe('Plugin Integration (index.js)', () => {
  let mockApi;
  const persistentDir = '/fake/storage';
  const configDir = `${persistentDir}/config`;
  const rulesPath = `${configDir}/rules.json`;
  const configPath = `${configDir}/config.json`;

  beforeEach(() => {
    // Reset modules before each test to ensure a clean slate
    jest.resetModules();

    // Mock the TheLounge API object
    mockApi = {
      Logger: {
        info: jest.fn(),
        error: jest.fn(),
      },
      Config: {
        getPersistentStorageDir: jest.fn(() => persistentDir),
      },
      Commands: {
        add: jest.fn(),
      },
    };
  });

  it('should correctly initialize all services when config dir does not exist', () => {
    // Arrange: Use jest.doMock to set up the fs mock just-in-time for this test.
    jest.doMock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(false),
      mkdirSync: jest.fn(),
      watchFile: jest.fn(),
      readFileSync: jest.fn().mockReturnValue('[]'),
      writeFileSync: jest.fn(),
    }));
    const fs = require('fs');
    const plugin = require('../index');
    const { answeringMachineCommand } = require('../src/commands');

    // Act
    plugin.onServerStart(mockApi);

    // Assert
    expect(mockApi.Logger.info).toHaveBeenCalledWith('[AM] Plugin loaded.');
    expect(fs.existsSync).toHaveBeenCalledWith(configDir);
    expect(fs.mkdirSync).toHaveBeenCalledWith(configDir, { recursive: true });
    expect(fs.readFileSync).toHaveBeenCalledWith(rulesPath, 'utf8');
    expect(fs.readFileSync).toHaveBeenCalledWith(configPath, 'utf8');
    expect(fs.watchFile).toHaveBeenCalledWith(rulesPath, expect.any(Object), expect.any(Function));
    expect(fs.watchFile).toHaveBeenCalledWith(configPath, expect.any(Object), expect.any(Function));
    expect(mockApi.Commands.add).toHaveBeenCalledWith('am', answeringMachineCommand);
  });

  it('should not create config directory if it already exists', () => {
    // Arrange: Mock fs for the case where the directory exists.
    jest.doMock('fs', () => ({
      existsSync: jest.fn().mockReturnValue(true),
      mkdirSync: jest.fn(),
      watchFile: jest.fn(),
      readFileSync: jest.fn().mockReturnValue('[]'),
      writeFileSync: jest.fn(),
    }));
    const fs = require('fs');
    const plugin = require('../index');

    // Act
    plugin.onServerStart(mockApi);

    // Assert
    expect(fs.mkdirSync).not.toHaveBeenCalled();
  });
});
