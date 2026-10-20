import Link from "next/link";

/** Link to compose an email or text to one customer. Embed on the customer page. */
export function MessageCustomerLink({ customerId, className = "btn", label = "Message" }: { customerId: string; className?: string; label?: string }) {
  return <Link className={className} href={`/messages/new?customer=${customerId}`}>{label}</Link>;
}

/** Link to that customer's message history. */
export function CustomerMessagesLink({ customerId, className = "small", label = "Messages" }: { customerId: string; className?: string; label?: string }) {
  return <Link className={className} href={`/messages?customer=${customerId}&num=1&unit=year&anchor=ending`}>{label}</Link>;
}
