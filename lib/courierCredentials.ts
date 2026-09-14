type CourierCredentialSource = {
  apiToken?: string | null;
  tranzoApiToken?: string | null;
  tcsBearerToken?: string | null;
  tcsApiUsername?: string | null;
  tcsApiPassword?: string | null;
  tcsCustomerNumber?: string | null;
  leopardsApiKey?: string | null;
  leopardsApiPassword?: string | null;
  mnpUsername?: string | null;
  mnpPassword?: string | null;
  mnpAccountNo?: string | null;
};

const present = (value?: string | null) => Boolean(value?.trim());

export function getCourierCredentialStatus(brand: CourierCredentialSource) {
  const tcsBearerConfigured = present(brand.tcsBearerToken)
    || present(process.env.TCS_BEARER_TOKEN)
    || (present(process.env.TCS_CLIENT_ID) && present(process.env.TCS_CLIENT_SECRET));

  return {
    zoom: present(process.env.ZOOM_AUTH_KEY),
    postex: present(brand.apiToken),
    tranzo: present(brand.tranzoApiToken),
    tcs: present(brand.tcsCustomerNumber)
      && (present(brand.tcsApiUsername) || present(process.env.TCS_API_USERNAME))
      && (present(brand.tcsApiPassword) || present(process.env.TCS_API_PASSWORD))
      && tcsBearerConfigured,
    leopards: (present(brand.leopardsApiKey) || present(process.env.LEOPARDS_API_KEY))
      && (present(brand.leopardsApiPassword) || present(process.env.LEOPARDS_API_PASSWORD)),
    mnp: (present(brand.mnpUsername) || present(process.env.MNP_USERNAME))
      && (present(brand.mnpPassword) || present(process.env.MNP_PASSWORD))
      && (present(brand.mnpAccountNo) || present(process.env.MNP_ACCOUNT_NO)),
  };
}