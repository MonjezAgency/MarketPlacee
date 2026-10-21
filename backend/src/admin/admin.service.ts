import { Injectable } from '@nestjs/common';

/**
 * Team management moved to TeamService (team.service.ts). The old methods here created
 * staff accounts with an emailed temporary password, accepted any role string (OWNER
 * included) and "deleted" members together with their orders and products; they were
 * removed rather than kept reachable. The provider stays registered for compatibility.
 */
@Injectable()
export class AdminService {}
