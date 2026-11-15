import { NextResponse, type NextRequest } from "next/server";

const supplierPortalHost = (
	process.env.NEXT_PUBLIC_SUPPLIER_PORTAL_HOST ?? "supplier.byponyo.com"
).toLowerCase();
const adminPortalHost = (
	process.env.NEXT_PUBLIC_ADMIN_PORTAL_HOST ?? "admin.byponyo.com"
).toLowerCase();

export function proxy(request: NextRequest) {
	const host = request.headers.get("host")?.split(":", 1)[0]?.toLowerCase();
	if (request.nextUrl.pathname !== "/") {
		return NextResponse.next();
	}
	if (host !== supplierPortalHost && host !== adminPortalHost)
		return NextResponse.next();

	const destination = request.nextUrl.clone();
	if (host === supplierPortalHost) {
		destination.pathname = "/supplier-portal";
	} else {
		destination.pathname = "/admin-portal";
	}
	return NextResponse.rewrite(destination);
}

export const config = {
	matcher: ["/"],
};
