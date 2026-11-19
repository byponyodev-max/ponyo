import { NextResponse, type NextRequest } from "next/server";

const supplierPortalHost = (
	process.env.NEXT_PUBLIC_SUPPLIER_PORTAL_HOST ?? "supplier.byponyo.com"
).toLowerCase();
const adminPortalHost = (
	process.env.NEXT_PUBLIC_ADMIN_PORTAL_HOST ?? "admin.byponyo.com"
).toLowerCase();

export function proxy(request: NextRequest) {
	const host = request.headers.get("host")?.split(":", 1)[0]?.toLowerCase();
	const pathname = request.nextUrl.pathname;
	const adminHostRoot = host === adminPortalHost && pathname === "/";
	const adminPortalPath = pathname === "/admin-portal" || pathname.startsWith("/admin-portal/");

	if (adminHostRoot || adminPortalPath) {
		const requestHeaders = new Headers(request.headers);
		requestHeaders.set("x-ponyo-admin-portal", "1");
		if (adminHostRoot) {
			const destination = request.nextUrl.clone();
			destination.pathname = "/admin-portal";
			return NextResponse.rewrite(destination, { request: { headers: requestHeaders } });
		}
		return NextResponse.next({ request: { headers: requestHeaders } });
	}

	if (pathname !== "/" || host !== supplierPortalHost) {
		return NextResponse.next();
	}

	const destination = request.nextUrl.clone();
	if (host === supplierPortalHost) {
		destination.pathname = "/supplier-portal";
	}
	return NextResponse.rewrite(destination);
}

export const config = {
	matcher: ["/", "/admin-portal/:path*"],
};
