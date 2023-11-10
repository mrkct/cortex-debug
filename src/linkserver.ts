import { DebugProtocol } from '@vscode/debugprotocol';
import { GDBServerController, ConfigurationArguments, createPortName, genDownloadCommands } from './common';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';

const commandExistsSync = require('command-exists').sync;
const SERVER_EXECUTABLE_NAME = os.platform() === 'win32' ? 'LinkServer.exe' : 'LinkServer';

function detectLinkServerPath(): string {
    if (commandExistsSync(SERVER_EXECUTABLE_NAME)) {
        return SERVER_EXECUTABLE_NAME;
    }

    const findLinkServerFolderOnWindows = () => {
        let bestCandidateFolder = '';
        try {
            const nxpToolsFolder = 'C:\\nxp';
            const linkServerFolderRegex = /LinkServer_(\d+)\.(\d+)\.(\d+)/ig;
            for (const subDir of fs.readdirSync(nxpToolsFolder).sort()) {
                const fullPath = path.join(nxpToolsFolder, subDir);
                const stats = fs.statSync(fullPath);
                if (!stats.isDirectory()) {
                    continue;
                }
                
                const match = linkServerFolderRegex.exec(subDir);
                if (!match) {
                    continue;
                }
                
                // Skip the folder if it doesn't contain the LinkServer executable for some reason
                if (!fs.existsSync(path.join(fullPath, SERVER_EXECUTABLE_NAME))) {
                    continue;
                }

                if (fullPath.localeCompare(bestCandidateFolder, undefined, {sensitivity: 'base', numeric: true}) > 0) {
                    bestCandidateFolder = fullPath;
                }
            }
        } catch (error) {
            // Ignore
        }

        return bestCandidateFolder;
    };

    switch (os.platform()) {
    case 'win32': {
        return findLinkServerFolderOnWindows() + SERVER_EXECUTABLE_NAME;
    }
    case 'linux': {
        // On Linux, LinkServer also creates a symbolic path to the latest version
        return '/usr/local/LinkServer/' + SERVER_EXECUTABLE_NAME;
    }
    default:
        return SERVER_EXECUTABLE_NAME;
    }
}

export class LinkServerServerController extends EventEmitter implements GDBServerController {
    public readonly name: string = 'LinkServer';
    public readonly portsNeeded: string[] = ['gdbPort', 'swoPort'];

    private args: ConfigurationArguments;
    private ports: { [name: string]: number };

    constructor() {
        super();
    }

    public setPorts(ports: { [name: string]: number }): void {
        this.ports = ports;
    }

    public setArguments(args: ConfigurationArguments): void {
        this.args = args;
    }

    public customRequest(command: string, response: DebugProtocol.Response, args: any): boolean {
        return false;
    }

    public initCommands(): string[] {
        const gdbport = this.ports[createPortName(this.args.targetProcessor)];
        return [
            `target-select extended-remote localhost:${gdbport}`
        ];
    }

    public launchCommands(): string[] {
        const commands = [
            // 'interpreter-exec console "monitor halt"',
            ...genDownloadCommands(this.args, ['interpreter-exec console "monitor reset"'])
            // 'interpreter-exec console "monitor reset"',
            // 'interpreter-exec console "monitor halt"'
        ];
        return commands;
    }

    public attachCommands(): string[] {
        const commands = [
            // 'interpreter-exec console "monitor halt"'
        ];
        return commands;
    }

    public restartCommands(): string[] {
        const commands: string[] = [
            // 'interpreter-exec console "monitor stop"',
            // 'interpreter-exec console "monitor system_reset"'
        ];
        return commands;
    }

    public allocateRTTPorts(): Promise<void> {
        return Promise.resolve();
    }

    public swoAndRTTCommands(): string[] {
        return [];
    }

    public serverExecutable(): string {
        if (this.args.serverpath) {
            return this.args.serverpath;
        } else {
            return detectLinkServerPath();
        }
    }

    public serverArguments(): string[] {
        const serverArgs = ['gdbserver', this.args.device, '--gdb-port', this.ports['gdbPort'].toString()];
        if (this.args.request === 'attach') {
            serverArgs.push('--attach');
        }

        return serverArgs;
    }

    public initMatch(): RegExp {
        return /(GDB server listening on port).*/ig;
    }

    public serverLaunchStarted(): void {}
    public serverLaunchCompleted(): void {}
    
    public debuggerLaunchStarted(): void {}
    public debuggerLaunchCompleted(): void {}
}
