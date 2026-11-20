import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, ...props }: IconProps) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden focusable="false" {...props} />;
}

/** `arrow-right-01-duotone-rounded` (icons.kevinnn.xyz). */
export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M9.00005 6C9.00005 6 15 10.4189 15 12C15 13.5812 9 18 9 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `arrow-right-02-duotone-rounded` (icons.kevinnn.xyz). */
export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M18.5 12H4.99997M13 18C13 18 19 13.5811 19 12C19 10.4188 13 6 13 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `arrow-down-01-duotone-rounded` (icons.kevinnn.xyz). */
export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M18 9.00005C18 9.00005 13.5811 15 12 15C10.4188 15 6 9 6 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `arrow-left-01-duotone-rounded` (icons.kevinnn.xyz). */
export function ChevronLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M15 6C15 6 9.00001 10.4189 9 12C8.99999 13.5812 15 18 15 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `arrow-left-right-duotone-rounded` (icons.kevinnn.xyz). */
export function SwapIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M19.9999 17.0001H3.99988M19.9999 17.0001C19.9999 16.2096 16.9999 14.0002 16.9999 14.0002M19.9999 17.0001C19.9999 17.7907 16.9999 20.0002 16.9999 20.0002" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4.99994 7L19.9999 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M6.99992 4C6.99992 4 3.99995 6.20947 3.99994 7.00002C3.99993 7.79058 6.99994 10 6.99994 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `calendar-03-duotone-rounded` (icons.kevinnn.xyz). */
export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M12.9991 4H10.9991C7.22789 4 5.34227 4 4.17069 5.17157C3.22761 6.11466 3.04368 7.52043 3.00781 10H20.9904C20.9546 7.52043 20.7706 6.11466 19.8275 5.17157C18.656 4 16.7704 4 12.9991 4Z" fill="currentColor"/> <path d="M16 2V6M8 2V6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/> <path d="M13 4H11C7.22876 4 5.34315 4 4.17157 5.17157C3 6.34315 3 8.22876 3 12V14C3 17.7712 3 19.6569 4.17157 20.8284C5.34315 22 7.22876 22 11 22H13C16.7712 22 18.6569 22 19.8284 20.8284C21 19.6569 21 17.7712 21 14V12C21 8.22876 21 6.34315 19.8284 5.17157C18.6569 4 16.7712 4 13 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/> <path d="M3 10H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/> <path d="M12.1258 14H12.0008M12.1258 18H12.0008M7.625 14H7.5M7.625 18H7.5M16.625 14H16.5M12.2508 14C12.2508 14.1381 12.1389 14.25 12.0008 14.25C11.8628 14.25 11.7508 14.1381 11.7508 14C11.7508 13.8619 11.8628 13.75 12.0008 13.75C12.1389 13.75 12.2508 13.8619 12.2508 14ZM12.2508 18C12.2508 18.1381 12.1389 18.25 12.0008 18.25C11.8628 18.25 11.7508 18.1381 11.7508 18C11.7508 17.8619 11.8628 17.75 12.0008 17.75C12.1389 17.75 12.2508 17.8619 12.2508 18ZM7.75 14C7.75 14.1381 7.63807 14.25 7.5 14.25C7.36193 14.25 7.25 14.1381 7.25 14C7.25 13.8619 7.36193 13.75 7.5 13.75C7.63807 13.75 7.75 13.8619 7.75 14ZM7.75 18C7.75 18.1381 7.63807 18.25 7.5 18.25C7.36193 18.25 7.25 18.1381 7.25 18C7.25 17.8619 7.36193 17.75 7.5 17.75C7.63807 17.75 7.75 17.8619 7.75 18ZM16.75 14C16.75 14.1381 16.6381 14.25 16.5 14.25C16.3619 14.25 16.25 14.1381 16.25 14C16.25 13.8619 16.3619 13.75 16.5 13.75C16.6381 13.75 16.75 13.8619 16.75 14Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `user-duotone-rounded` (icons.kevinnn.xyz). */
export function UserIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle opacity="0.4" cx="12" cy="6.99988" r="4" fill="currentColor"/> <path opacity="0.4" d="M12 13.9999C11.6446 14.0096 11.3134 14.0225 11.0008 14.0378C7.3 14.2192 4.28417 17.3057 4 21.0001H20C19.713 17.269 16.7289 14.3151 12.995 14.0662L12 13.9999Z" fill="currentColor"/> <path d="M20 21.0001C19.713 17.269 16.7289 14.3151 12.995 14.0662L12 13.9999C11.6446 14.0096 11.3134 14.0225 11.0008 14.0378C7.3 14.2192 4.28417 17.3057 4 21.0001" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/> <circle cx="12" cy="6.99988" r="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `user-group-duotone-rounded` (icons.kevinnn.xyz). */
export function UsersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M11.9997 15C11.711 15.0076 11.4418 15.0178 11.1879 15.0298C8.181 15.1723 5.73065 17.5974 5.49976 20.5H18.4998C18.2666 17.5685 15.842 15.2477 12.8082 15.0521L11.9997 15Z" fill="currentColor" />
      <path opacity="0.4" d="M15.2498 9.25C15.2498 11.0449 13.7947 12.5 11.9998 12.5C10.2048 12.5 8.74976 11.0449 8.74976 9.25C8.74976 7.45507 10.2048 6 11.9998 6C13.7947 6 15.2498 7.45507 15.2498 9.25Z" fill="currentColor" />
      <path d="M18.4999 20.5C18.2667 17.5685 15.8421 15.2477 12.8083 15.0521L11.9999 15C11.7111 15.0076 11.442 15.0178 11.188 15.0298C8.18112 15.1723 5.73077 17.5974 5.49988 20.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.2499 9.25C15.2499 11.0449 13.7948 12.5 11.9999 12.5C10.205 12.5 8.74988 11.0449 8.74988 9.25C8.74988 7.45507 10.205 6 11.9999 6C13.7948 6 15.2499 7.45507 15.2499 9.25Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5.50286 8.5C5.17944 7.99485 4.99194 7.39432 4.99194 6.75C4.99194 4.95507 6.44702 3.5 8.24194 3.5C8.68789 3.5 9.11286 3.58982 9.49976 3.75235" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18.4967 8.5C18.8201 7.99485 19.0076 7.39432 19.0076 6.75C19.0076 4.95507 17.5525 3.5 15.7576 3.5C15.3116 3.5 14.8866 3.58982 14.4998 3.75235" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M22.0011 17.9996C21.8211 15.7374 19.9999 13.5 17.9999 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M1.99963 17.9996C2.17959 15.7374 4.00086 13.5 6.00086 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** `search-01-duotone-rounded` (icons.kevinnn.xyz). */
export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19C15.4183 19 19 15.4183 19 11Z" fill="currentColor"/> <path d="M17 17L21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/> <path d="M19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11C3 15.4183 6.58172 19 11 19C15.4183 19 19 15.4183 19 11Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `link-square-02-duotone-rounded` (icons.kevinnn.xyz). */
export function ExternalLinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M3 12C3 7.75736 3 5.63604 4.31802 4.31802C5.63604 3 7.75736 3 12 3C16.2426 3 18.364 3 19.682 4.31802C21 5.63604 21 7.75736 21 12C21 16.2426 21 18.364 19.682 19.682C18.364 21 16.2426 21 12 21C7.75736 21 5.63604 21 4.31802 19.682C3 18.364 3 16.2426 3 12Z" fill="currentColor"/> <path d="M11.1002 3C7.45057 3.00657 5.53942 3.09617 4.31806 4.31754C3 5.63559 3 7.75698 3 11.9997C3 16.2425 3 18.3639 4.31806 19.6819C5.63611 21 7.7575 21 12.0003 21C16.243 21 18.3644 21 19.6825 19.6819C20.9038 18.4606 20.9934 16.5494 21 12.8998" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/> <path d="M20.5327 3.44437L11.0234 13.0096M20.5327 3.44437C20.0386 2.94961 16.7102 2.99573 16.0066 3.00574M20.5327 3.44437C21.0267 3.93913 20.9807 7.27206 20.9707 7.97667" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `alert-circle-duotone-rounded` (icons.kevinnn.xyz). */
export function AlertIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle opacity="0.4" cx="12" cy="12" r="10" fill="currentColor"/> <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/> <path d="M12 8V12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/> <path d="M12.125 15.75H12M12.25 15.75C12.25 15.8881 12.1381 16 12 16C11.8619 16 11.75 15.8881 11.75 15.75C11.75 15.6119 11.8619 15.5 12 15.5C12.1381 15.5 12.25 15.6119 12.25 15.75Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `plus-sign-duotone-rounded` (icons.kevinnn.xyz). */
export function PlusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 4V20M20 12H4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `minus-sign-duotone-rounded` (icons.kevinnn.xyz). */
export function MinusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 12L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `moon-02-duotone-rounded` (icons.kevinnn.xyz). */
export function MoonIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M21.5 14.0784C20.3003 14.7189 18.9301 15.0821 17.4751 15.0821C12.7491 15.0821 8.91792 11.2509 8.91792 6.52485C8.91792 5.06986 9.28105 3.69968 9.92163 2.5C5.66765 3.49698 2.5 7.31513 2.5 11.8731C2.5 17.1899 6.8101 21.5 12.1269 21.5C16.6849 21.5 20.503 18.3324 21.5 14.0784Z" fill="currentColor"/>
      <path d="M21.5 14.0784C20.3003 14.7189 18.9301 15.0821 17.4751 15.0821C12.7491 15.0821 8.91792 11.2509 8.91792 6.52485C8.91792 5.06986 9.28105 3.69968 9.92163 2.5C5.66765 3.49698 2.5 7.31513 2.5 11.8731C2.5 17.1899 6.8101 21.5 12.1269 21.5C16.6849 21.5 20.503 18.3324 21.5 14.0784Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `sun-03-duotone-rounded` (icons.kevinnn.xyz). */
export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M17 12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12C7 9.23858 9.23858 7 12 7C14.7614 7 17 9.23858 17 12Z" fill="currentColor"/>
      <path d="M17 12C17 14.7614 14.7614 17 12 17C9.23858 17 7 14.7614 7 12C7 9.23858 9.23858 7 12 7C14.7614 7 17 9.23858 17 12Z" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12 2V3.5M12 20.5V22M19.0708 19.0713L18.0101 18.0106M5.98926 5.98926L4.9286 4.9286M22 12H20.5M3.5 12H2M19.0713 4.92871L18.0106 5.98937M5.98975 18.0107L4.92909 19.0714" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </Svg>
  );
}

/** `more-horizontal-duotone-rounded` (icons.kevinnn.xyz). */
export function MoreHorizontalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.00449 12.5V12M18.0045 12.5V12M12.0045 12.5V12M7.00449 12.5C7.00449 11.9477 6.55677 11.5 6.00449 11.5C5.4522 11.5 5.00449 11.9477 5.00449 12.5C5.00449 13.0523 5.4522 13.5 6.00449 13.5C6.55677 13.5 7.00449 13.0523 7.00449 12.5ZM19.0045 12.5C19.0045 11.9477 18.5568 11.5 18.0045 11.5C17.4522 11.5 17.0045 11.9477 17.0045 12.5C17.0045 13.0523 17.4522 13.5 18.0045 13.5C18.5568 13.5 19.0045 13.0523 19.0045 12.5ZM13.0045 12.5C13.0045 11.9477 12.5568 11.5 12.0045 11.5C11.4522 11.5 11.0045 11.9477 11.0045 12.5C11.0045 13.0523 11.4522 13.5 12.0045 13.5C12.5568 13.5 13.0045 13.0523 13.0045 12.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `arrow-left-double-duotone-rounded` (icons.kevinnn.xyz). */
export function ChevronsLeftIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M11.5 18C11.5 18 5.50001 13.5811 5.5 12C5.49999 10.4188 11.5 6 11.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path opacity="0.4" d="M18.5 18C18.5 18 12.5 13.5811 12.5 12C12.5 10.4188 18.5 6 18.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `arrow-right-double-duotone-rounded` (icons.kevinnn.xyz). */
export function ChevronsRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M12.5 18C12.5 18 18.5 13.5811 18.5 12C18.5 10.4188 12.5 6 12.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path opacity="0.4" d="M5.50005 18C5.50005 18 11.5 13.5811 11.5 12C11.5 10.4188 5.5 6 5.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `tick-02-duotone-rounded` (icons.kevinnn.xyz). */
/** `checkmark-circle-01-duotone-rounded` (icons.kevinnn.xyz). */
export function TickIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z" fill="currentColor" />
      <path d="M22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 12.75C8 12.75 9.6 13.6625 10.4 15C10.4 15 12.8 9.75 16 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** `unfold-more-duotone-rounded` (icons.kevinnn.xyz). */
export function UnfoldMoreIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M18 14C18 14 13.5811 19 12 19C10.4188 19 6 14 6 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M18 9.99996C18 9.99996 13.5811 5.00001 12 5C10.4188 4.99999 6 10 6 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </Svg>
  );
}

/** `link-01-duotone-rounded` (icons.kevinnn.xyz). */
export function LinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path opacity="0.4" d="M6.9484 12.886L6.48405 13.3503C4.50532 15.3291 4.50532 18.5372 6.48405 20.516C8.46279 22.4947 11.671 22.4947 13.6497 20.516L16.5159 17.6497C18.2962 15.8694 18.4748 13.0939 17.0516 11.114L14.6497 13.516C12.671 15.4947 9.46279 15.4947 7.48405 13.516C7.2856 13.3175 7.10705 13.1067 6.9484 12.886Z" fill="currentColor"/>
      <path d="M9.14339 10.691L9.35031 10.4841C11.329 8.50532 14.5372 8.50532 16.5159 10.4841C18.4947 12.4628 18.4947 15.671 16.5159 17.6497L13.6497 20.5159C11.671 22.4947 8.46279 22.4947 6.48405 20.5159C4.50532 18.5372 4.50532 15.329 6.48405 13.3503L6.9484 12.886" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M17.0516 11.114L17.5159 10.6497C19.4947 8.67095 19.4947 5.46279 17.5159 3.48405C15.5372 1.50532 12.329 1.50532 10.3503 3.48405L7.48405 6.35031C5.50532 8.32904 5.50532 11.5372 7.48405 13.5159C9.46279 15.4947 12.671 15.4947 14.6497 13.5159L14.8566 13.309" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </Svg>
  );
}
