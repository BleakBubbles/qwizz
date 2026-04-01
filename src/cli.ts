#!/usr/bin/env node

import { gate } from './commands/gate.js'
import { install, uninstall } from './commands/install.js'
import { doctor } from './commands/doctor.js'

const command = process.argv[2]

switch (command) {
	case 'install':
		install({ native: process.argv.includes('--native') })
		break
	case 'gate':
		await gate()
		break
	case 'uninstall':
		uninstall()
		break
	case 'doctor':
		doctor()
		break
	default:
		console.error('Usage: qwizz <install [--native]|gate|uninstall|doctor>')
		process.exit(1)
}
