import { TaskIdentifier } from '@lobechat/builtin-tool-task';
import { BRANDING_LOGO_URL } from '@lobechat/business-const';
import { DEFAULT_PROVIDER } from '@lobechat/business-const';
import { DEFAULT_MODEL } from '@lobechat/const';

import type { BuiltinAgentDefinition } from '../../types';
import { BUILTIN_AGENT_SLUGS } from '../../types';
import { systemRoleTemplate } from './systemRole';

export const TASK_AGENT: BuiltinAgentDefinition = {
  avatar: BRANDING_LOGO_URL || '/logo/agentes-icon.png',
  persist: {
    model: DEFAULT_MODEL,
    provider: DEFAULT_PROVIDER,
  },
  runtime: (ctx) => ({
    plugins: [TaskIdentifier, ...(ctx.plugins || [])],
    systemRole: systemRoleTemplate,
  }),
  slug: BUILTIN_AGENT_SLUGS.taskAgent,
};
