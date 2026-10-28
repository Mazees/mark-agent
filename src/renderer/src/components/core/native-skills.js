import { Blocks, KeyRound, ListChecks } from 'lucide-react'
import { NATIVE_SKILLS as definitions } from '../../../../shared/agent/native-skills.js'
const icons = { 'setup-google-workspace': KeyRound, 'create-plugin': Blocks, task: ListChecks }
export const NATIVE_SKILLS = definitions.map((skill) => ({ ...skill, icon: icons[skill.name] }))
