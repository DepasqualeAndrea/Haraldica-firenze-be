import { UserRole } from "src/database/entities/user.entity";

export interface JwtPayload {
    sub: string;
    email: string;
    role: UserRole;
    type: UserRole.CUSTOMER;
    iat?: number;
    exp?: number;
}

/**
 * Payload JWT per guest users
 */
export interface GuestTokenPayload {
    sub: string;
    email: string;
    role: UserRole;
    type: UserRole.GUEST;
    iat?: number;
    exp?: number;
}