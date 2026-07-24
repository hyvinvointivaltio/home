import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL puuttuu ympäristömuuttujista.");
}

if (!SUPABASE_SECRET_KEY) {
  throw new Error(
    "SUPABASE_SECRET_KEY tai SUPABASE_SERVICE_ROLE_KEY puuttuu ympäristömuuttujista."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const STORAGE_BUCKET = "atlas-images";

function assertResult(result, label) {
  if (result.error) {
    throw new Error(`${label}: ${result.error.message}`);
  }

  return result.data;
}

function publicStorageUrl(storagePath) {
  return `${SUPABASE_URL}/storage/v1/object/public/${STORAGE_BUCKET}/${storagePath}`;
}

async function exportMurrosvaiheet() {
  const [itemsResult, relationsResult, metaResult, attachmentsResult] =
    await Promise.all([
      supabase
        .from("items")
        .select("*")
        .order("year_start", { ascending: true }),

      supabase
        .from("relations")
        .select("*")
        .order("id", { ascending: true }),

      supabase
        .from("dataset_meta")
        .select("data")
        .eq("id", "murrosvaiheet")
        .single(),

      supabase
        .from("attachments")
        .select("item_id,storage_path,caption,sort_order")
        .not("item_id", "is", null)
        .order("sort_order", { ascending: true }),
    ]);

  const itemRows = assertResult(
    itemsResult,
    "Korttien haku epäonnistui"
  );

  const relationRows = assertResult(
    relationsResult,
    "Relaatioiden haku epäonnistui"
  );

  const metaRow = assertResult(
    metaResult,
    "Murrosmetan haku epäonnistui"
  );

  const attachmentRows = assertResult(
    attachmentsResult,
    "Korttikuvien haku epäonnistui"
  );

  const imagesByItem = new Map();

  for (const attachment of attachmentRows) {
    if (!imagesByItem.has(attachment.item_id)) {
      imagesByItem.set(attachment.item_id, []);
    }

    imagesByItem.get(attachment.item_id).push({
      url: publicStorageUrl(attachment.storage_path),
      caption: attachment.caption,
    });
  }

  const publishedRows = itemRows.filter(
    (item) => !item.unpublished
  );

  const publishedIds = new Set(
    publishedRows.map((item) => item.id)
  );

  const items = publishedRows.map((item) => {
    const output = {
      id: item.id,
      title: item.title,
      year_start: item.year_start,
      year_end: item.year_end,
      type: item.type,
      domains: item.domains,
      phase: item.phase,
      problem: item.problem,
      mechanism: item.mechanism,
      effects: item.effects,
      long_effect: item.long_effect,
      current_relevance: item.current_relevance,
      importance: item.importance,
      confidence: item.confidence,
    };

    if (item.sources?.length) {
      output.sources = item.sources;
    }

    const images = imagesByItem.get(item.id);

    if (images?.length) {
      output.images = images;
    }

    return output;
  });

  const relations = relationRows
    .filter(
      (relation) =>
        publishedIds.has(relation.from_id) &&
        publishedIds.has(relation.to_id)
    )
    .map((relation) => ({
      from: relation.from_id,
      to: relation.to_id,
      type: relation.type,
      rel_class: relation.rel_class,
      confidence: relation.confidence,
      rationale: relation.rationale,
    }));

  return {
    meta: {
      ...(metaRow.data || {}),
      count: items.length,
      relation_count: relations.length,
    },
    items,
    relations,
  };
}

async function exportArtikkelit() {
  const [
    articlesResult,
    linksResult,
    relationTypesResult,
    metaResult,
    unpublishedItemsResult,
    attachmentsResult,
  ] = await Promise.all([
    supabase
      .from("articles")
      .select("*")
      .order("id", { ascending: true }),

    supabase
      .from("article_links")
      .select(
        "article_id,item_id,relation_type,weight,sort_order"
      )
      .order("sort_order", { ascending: true }),

    supabase
      .from("article_relation_types")
      .select("*")
      .order("type"),

    supabase
      .from("article_dataset_meta")
      .select("data")
      .eq("id", "artikkelit")
      .single(),

    supabase
      .from("items")
      .select("id")
      .eq("unpublished", true),

    supabase
      .from("attachments")
      .select(
        "article_id,storage_path,caption,sort_order"
      )
      .not("article_id", "is", null)
      .order("sort_order", { ascending: true }),
  ]);

  const articleRows = assertResult(
    articlesResult,
    "Artikkelien haku epäonnistui"
  );

  const linkRows = assertResult(
    linksResult,
    "Artikkelikytkentöjen haku epäonnistui"
  );

  const relationTypeRows = assertResult(
    relationTypesResult,
    "Artikkelirelaatiotyyppien haku epäonnistui"
  );

  const metaRow = assertResult(
    metaResult,
    "Artikkelimetan haku epäonnistui"
  );

  const unpublishedRows = assertResult(
    unpublishedItemsResult,
    "Julkaisemattomien korttien haku epäonnistui"
  );

  const attachmentRows = assertResult(
    attachmentsResult,
    "Artikkelikuvien haku epäonnistui"
  );

  const unpublishedIds = new Set(
    unpublishedRows.map((item) => item.id)
  );

  const imagesByArticle = new Map();

  for (const attachment of attachmentRows) {
    if (!imagesByArticle.has(attachment.article_id)) {
      imagesByArticle.set(attachment.article_id, []);
    }

    imagesByArticle.get(attachment.article_id).push({
      url: publicStorageUrl(attachment.storage_path),
      caption: attachment.caption,
    });
  }

  const articles = articleRows.map((article) => {
    const output = {
      id: article.id,
      title: article.title,
      dek: article.dek,
      tags: article.tags,
      status: article.status,
      note: article.note,
      body: article.body,
    };

    const images = imagesByArticle.get(article.id);

    if (images?.length) {
      output.images = images;
    }

    return output;
  });

  const links = linkRows
    .filter(
      (link) => !unpublishedIds.has(link.item_id)
    )
    .map((link) => ({
      article_id: link.article_id,
      item_id: link.item_id,
      relation_type: link.relation_type,
      weight: link.weight,
      sort_order: link.sort_order,
    }));

  const relation_types = Object.fromEntries(
    relationTypeRows.map((row) => [
      row.type,
      row.label,
    ])
  );

  return {
    meta: {
      ...(metaRow.data || {}),
      count: articles.length,
      link_count: links.length,
    },
    relation_types,
    articles,
    links,
  };
}

async function exportYhdistys() {
  const [
    associationResult,
    boardResult,
    documentsResult,
  ] = await Promise.all([
    supabase
      .from("association")
      .select("*")
      .eq("id", "main")
      .single(),

    supabase
      .from("association_board_members")
      .select("*")
      .order("sort_order", { ascending: true }),

    supabase
      .from("association_documents")
      .select("*")
      .order(
        "group_sort_order",
        { ascending: true }
      )
      .order(
        "sort_order",
        { ascending: true }
      ),
  ]);

  const association = assertResult(
    associationResult,
    "Yhdistyksen ydintietojen haku epäonnistui"
  );

  const boardRows = assertResult(
    boardResult,
    "Hallituksen tietojen haku epäonnistui"
  );

  const documentRows = assertResult(
    documentsResult,
    "Yhdistyksen asiakirjojen haku epäonnistui"
  );

  const documentGroups = new Map();

  for (const document of documentRows) {
    const key = document.group_title;

    if (!documentGroups.has(key)) {
      documentGroups.set(key, {
        title: document.group_title,
        _sort: document.group_sort_order,
        empty_text:
          document.group_empty_text || undefined,
        items: [],
      });
    }

    const group = documentGroups.get(key);

    if (document.group_empty_text) {
      group.empty_text =
        document.group_empty_text;
    }

    if (document.title) {
      const item = {
        title: document.title,
      };

      if (document.description) {
        item.description =
          document.description;
      }

      if (document.date) {
        item.date = document.date;
      }

      if (document.type) {
        item.type = document.type;
      }

      if (document.url) {
        item.url = document.url;
      }

      group.items.push(item);
    }
  }

  const documents = [
    ...documentGroups.values(),
  ]
    .sort(
      (left, right) =>
        left._sort - right._sort
    )
    .map(({ _sort, ...group }) => group);

  const board = boardRows.map((member) => {
    const output = {
      name: member.name,
      role: member.role,
    };

    if (member.email) {
      output.email = member.email;
    }

    if (member.phone) {
      output.phone = member.phone;
    }

    if (member.profile_url) {
      output.profile_url =
        member.profile_url;
    }

    if (member.image) {
      output.image = member.image;
    }

    if (member.note) {
      output.note = member.note;
    }

    return output;
  });

  return {
    name: association.name,
    short_name: association.short_name,
    kicker: association.kicker,
    mission: association.mission,
    role_in_atlas:
      association.role_in_atlas,
    activities_title:
      association.activities_title,
    activities: association.activities,
    chair: association.chair,
    updated: association.updated,
    links: association.links,
    membership: association.membership,
    board: {
      lead: association.board_lead,
      members: board,
    },
    documents,
  };
}

async function writeJson(filename, value) {
  await writeFile(
    filename,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );

  console.log(`Kirjoitettu ${filename}`);
}

async function main() {
  console.log(
    "Haetaan Murrosmatriisin data Supabasesta…"
  );

  const [
    murrosExport,
    artikkelitExport,
    yhdistysExport,
  ] = await Promise.all([
    exportMurrosvaiheet(),
    exportArtikkelit(),
    exportYhdistys(),
  ]);

  await Promise.all([
    writeJson(
      "suomen_murrosvaiheet_syvennetty.json",
      murrosExport
    ),

    writeJson(
      "artikkelit.json",
      artikkelitExport
    ),

    writeJson(
      "yhdistys.json",
      yhdistysExport
    ),
  ]);

  console.log(
    `Valmis: ${murrosExport.items.length} korttia, ` +
      `${murrosExport.relations.length} relaatiota, ` +
      `${artikkelitExport.articles.length} artikkelia ja ` +
      `${artikkelitExport.links.length} artikkelikytkentää.`
  );
}

main().catch((error) => {
  console.error(
    "JSON-export epäonnistui:",
    error
  );

  process.exitCode = 1;
});
